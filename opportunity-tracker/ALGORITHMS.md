# Opportunity Tracker Algorithms

This document explains the main algorithms and processing rules used by the IEEE Opportunity Tracker, how they work, and where they are applied.

## 1. Queue Claiming Algorithm

**Where it is used:** `backend/api/index.js` in the admin scrape queue endpoint.

### Purpose
Limit scraping pressure on the system by letting the worker claim only a small batch of organizations or URLs at a time.

### How it works
- The admin scrape request does not scrape directly.
- It marks an organization as queued.
- The worker requests `/api/admin/scrape-queue`.
- The backend returns a small set of claimable organizations that have cooled down long enough.
- Each organization is atomically claimed before URLs are returned, which reduces duplicate work between worker restarts or parallel runs.

### Why this algorithm is used
- Prevents multiple worker runs from scraping the same organization at the same time.
- Reduces database and network load.
- Makes retries safer on free-tier infrastructure.

### Important controls
- `SCRAPE_QUEUE_COOLDOWN_MS`
- `SCRAPE_QUEUE_ORG_LIMIT`
- `SCRAPE_QUEUE_URLS_PER_ORG`
- `SCRAPE_QUEUE_TOTAL_URL_LIMIT`

---

## 2. Hybrid Fetch Algorithm

**Where it is used:** `backend/fetchPage.js` and `backend/scraper-enhanced.js`.

### Purpose
Fetch webpage HTML reliably even when sites block simple requests.

### How it works
1. Try Axios first because it is fast and low-cost.
2. If Axios gets blocked, times out, or returns a challenge page, fall back to Playwright.
3. Playwright opens a real browser context, waits for the page to render, and extracts HTML.
4. If Playwright also fails, the error is wrapped with metadata so the worker can count the fallback attempt and report it correctly.

### Why this algorithm is used
- Axios is cheaper and faster for normal pages.
- Playwright handles anti-bot or JavaScript-rendered pages.
- The fallback model improves coverage without forcing all requests through a browser.

### Important details
- Anti-bot patterns include 403, 429, Cloudflare checks, and other block pages.
- Playwright failures are tagged so metrics can show both successful usage and attempted fallback counts.

---

## 3. Safe Bounded Crawl Algorithm

**Where it is used:** `backend/utils/scraper.js`.

### Purpose
Collect enough relevant text from a source site without crawling too deeply or too broadly.

### How it works
- Start from one or more seed URLs.
- Use a queue of URLs to visit.
- Visit only same-domain links.
- Prioritize more relevant links by scoring them.
- Respect hard limits for:
  - maximum pages
  - maximum crawl depth
  - maximum links per page
  - maximum text per page
  - total text budget
- Skip blocked file types such as PDFs, office files, archives, and media.

### Why this algorithm is used
- Prevents runaway crawling.
- Keeps scraping predictable and cheap.
- Focuses the model on pages likely to contain opportunity content.

### Important controls
- `SCRAPER_MAX_PAGES`
- `SCRAPER_MAX_DEPTH`
- `SCRAPER_MAX_LINKS_PER_PAGE`
- `SCRAPER_MAX_TEXT_PER_PAGE`
- `SCRAPER_TOTAL_TEXT_CAP`

---

## 4. Text Extraction and Opportunity Structuring

**Where it is used:** `backend/utils/scraper.js`, `backend/scraper-enhanced.js`.

### Purpose
Convert messy webpage content into structured opportunity records.

### How it works
- Remove non-content elements such as `script`, `style`, `nav`, `footer`, `header`, `iframe`, and `noscript`.
- Extract visible body text.
- If the page is thin, use fallback low-signal text extraction.
- Send the cleaned text to Gemini.
- Ask Gemini to return strict JSON objects with:
  - title
  - description
  - deadline
  - eligibility
  - url
  - type
  - status

### Why this algorithm is used
- The raw web text is too noisy for direct storage.
- LLM extraction turns unstructured content into a normalized opportunity schema.

### Important controls
- Text caps limit how much content is sent to the model.
- Retry/failover logic is used when the AI quota or provider is unavailable.

---

## 5. Title Quality Filtering Algorithm

**Where it is used:** `backend/scraper-enhanced.js` and update logic in `backend/api/index.js`.

### Purpose
Reject weak titles such as homepage labels, domain names, and generic landing-page text.

### How it works
A title is treated as low-signal when it matches patterns like:
- `Home`
- `Homepage`
- `Home Page`
- domain-like strings
- organization-name-only titles
- generic landing phrases like `Join our vibrant community today!`

The code also allows exceptions when the title contains strong event signals such as:
- conference
- workshop
- webinar
- contest
- award
- program
- internship

### Why this algorithm is used
- Prevents scraped records from being stored with useless titles.
- Helps keep the feed readable and searchable.

### Update behavior
- Existing auto-created, unverified records can be refreshed with better title/description/type information when a new scrape produces a stronger result.

---

## 6. Fuzzy Duplicate Detection Algorithm

**Where it is used:** `backend/api/index.js` and `backend/fuzzy-dedup.js`.

### Purpose
Detect opportunities that are likely duplicates even if the wording is not identical.

### How it works
1. Normalize both titles:
   - lowercase
   - remove punctuation
   - split into words
   - remove common stop words such as `ieee`, `the`, `and`, `program`, `council`, `society`, `chapter`, `section`, `award`
   - apply simple plural stemming
2. Convert each title into a word set.
3. Compute similarity as:

$$
\text{similarity} = \frac{\text{intersection size}}{\min(\text{set1 size}, \text{set2 size})}
$$

This is a subset-style similarity score rather than strict Jaccard.

### Why this algorithm is used
- It handles titles such as:
  - `ECE Travel Grant`
  - `Biometrics ECE Travel Grant`
- It is intentionally forgiving when one title is a superset of the other.

### Thresholds
- `SCRAPE_MATCH_THRESHOLD` is used for update-time matching.
- `DUPLICATE_GROUP_THRESHOLD` is used to build admin duplicate groups.
- `backend/fuzzy-dedup.js` uses a 0.6 threshold for a deeper cleanup pass.

---

## 7. Duplicate Grouping and Merge Algorithm

**Where it is used:** `backend/api/index.js` admin duplicate endpoints.

### Purpose
Group likely duplicate opportunities and let an admin merge them into one record.

### How it works
- Fetch all opportunities for an organization.
- Build a graph where records are connected if:
  - their deadlines are close enough, and
  - their title similarity is above the threshold.
- Find connected components in that graph using BFS.
- Each connected component with at least two records becomes a duplicate group.
- The system recommends a primary record using a ranking order:
  1. verified
  2. manual source
  3. better status (`Live` > `Upcoming` > `Closed`)
  4. more complete fields
  5. most recently updated

### Why this algorithm is used
- It avoids brittle exact matching.
- It lets admins consolidate near-duplicates safely.

---

## 8. Date Inference and Status Logic

**Where it is used:** `backend/api/index.js`.

### Purpose
Set a useful deadline and status even when the source is incomplete.

### How it works
- Parse explicit dates if present.
- Otherwise infer dates from title/description text.
- If a date is in the past, mark the opportunity `Closed`.
- If there is no valid date, keep the best known status or default to `Live`.

### Why this algorithm is used
- Scraped pages often omit structured deadlines.
- Derived status makes the feed more useful.

---

## 9. Persona and Eligibility Filtering Algorithm

**Where it is used:** `backend/api/index.js` opportunities API.

### Purpose
Hide opportunities that are not eligible for the selected persona.

### How it works
- Build a persona-based restriction object.
- Apply the restriction before pagination.
- Regex-based exclusions can filter out text that clearly conflicts with the selected persona.

### Why this algorithm is used
- Prevents ineligible opportunities from appearing in later pages.
- Keeps the feed aligned to the selected audience.

---

## 10. Noise Filtering Algorithm for Admin Views

**Where it is used:** `backend/api/index.js` and `frontend/src/pages/AdminDashboard.jsx`.

### Purpose
Hide generic page-noise rows from the admin list while keeping the raw data available if needed.

### How it works
- The opportunities API accepts `excludeNoise=true`.
- When enabled, the query excludes common noise titles such as homepage labels, newsletter headers, and generic promotional text.
- The admin dashboard enables this mode by default but allows toggling it off.

### Why this algorithm is used
- Improves readability.
- Keeps admin focused on real opportunities.
- Preserves the underlying data for audit or recovery.

---

## 11. URL Canonicalization Algorithm

**Where it is used:** `backend/api/index.js`.

### Purpose
Normalize URLs so the system can detect duplicates and avoid storing noisy variants.

### How it works
- Trim URLs.
- Remove hashes and query strings.
- Normalize trailing slashes.
- Keep only valid `http` or `https` URLs.

### Why this algorithm is used
- Prevents duplicate opportunities caused by URL formatting differences.
- Makes canonical URL matching more reliable.

---

## 12. Queue Result Retry Algorithm

**Where it is used:** `backend/scraper-enhanced.js`.

### Purpose
Avoid losing scrape results if the API is temporarily unavailable.

### How it works
- If sending a scrape result to the API fails, the worker appends it to a local queue file.
- A periodic flush loop retries queued results later.
- The queue is best-effort and not durable on ephemeral filesystem restarts.

### Why this algorithm is used
- Preserves progress during transient outages.
- Reduces lost work when the backend is temporarily unavailable.

---

## 13. Playwright Metrics Algorithm

**Where it is used:** `backend/scraper-enhanced.js`.

### Purpose
Report how often Playwright is attempted versus how often it is actually used successfully.

### How it works
- Count successful Axios fetches.
- Count Playwright attempts separately.
- Count Playwright successes separately.
- Include those values in periodic summaries.

### Why this algorithm is used
- Gives a more accurate picture of anti-bot pressure and fallback cost.
- Helps distinguish attempted fallback from successful fallback.

---

## 14. Why the System Uses These Algorithms

The system combines these algorithms to balance three goals:

1. **Coverage**
   - Crawl enough of the web to discover meaningful opportunities.

2. **Quality**
   - Filter low-signal titles, deduplicate records, and refresh stale metadata.

3. **Cost control**
   - Limit queue pressure, reduce repeated work, and keep the system usable on free-tier infrastructure.

---

## File Map

- `backend/api/index.js`
  - queue claiming
  - duplicate grouping/merge
  - persona filtering
  - admin noise filtering
  - URL canonicalization
  - record refresh on re-scrape

- `backend/utils/scraper.js`
  - safe bounded crawl
  - content extraction
  - Gemini structuring

- `backend/fetchPage.js`
  - Axios + Playwright hybrid fetch

- `backend/scraper-enhanced.js`
  - worker queue processing
  - retry queue
  - metrics
  - low-signal title detection

- `backend/fuzzy-dedup.js`
  - deeper duplicate cleanup pass

---

## Notes

- This document describes the current behavior in the codebase, not a theoretical design.
- Some thresholds are environment-controlled and may be tuned for production or free-tier use.
- If you want, this can be split into smaller docs later, such as:
  - `crawling.md`
  - `deduplication.md`
  - `queueing.md`
  - `admin.md`
