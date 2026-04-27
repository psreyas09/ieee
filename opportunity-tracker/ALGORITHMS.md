# Opportunity Tracker Algorithms

This document focuses strictly on the algorithms and processing rules used by the Opportunity Tracker: what each algorithm does, where it lives, important parameters, and why the project uses it. Operational runbook and onboarding material were moved to `ONBOARDING.md`.

## 1. Queue Claiming Algorithm

Where it is used: `backend/api/index.js` (admin scrape queue endpoint).

Purpose: limit scraping pressure by letting the worker claim small batches of organizations or URLs.

How it works:
- Admin enqueues organizations/URLs.
- Worker polls `/api/admin/scrape-queue` and receives claimable items that have cooled down.
- Each organization is claimed atomically before URLs are returned to avoid duplicate work.

Controls: `SCRAPE_QUEUE_COOLDOWN_MS`, `SCRAPE_QUEUE_ORG_LIMIT`, `SCRAPE_QUEUE_URLS_PER_ORG`, `SCRAPE_QUEUE_TOTAL_URL_LIMIT`.

## 2. Hybrid Fetch Algorithm

Where it is used: `backend/fetchPage.js` and `backend/scraper-enhanced.js`.

Purpose: fetch page HTML reliably while minimizing browser usage.

How it works:
1. Attempt fetch with Axios (fast, low-cost).
2. If blocked/timeouts/challenge pages detected, fall back to Playwright (headless browser).
3. Playwright renders the page, then extracts HTML.
4. Errors are annotated (e.g., attemptedPlaywright) so metrics track attempts vs successes.

Important notes: anti-bot patterns include 403, 429, Cloudflare checks; Playwright is used selectively to control cost.

## 3. Safe Bounded Crawl Algorithm

Where it is used: `backend/utils/scraper.js`.

Purpose: gather relevant content without runaway crawling.

How it works:
- Start from seed URLs and maintain a visit queue.
- Restrict to same-domain links.
- Score and prioritize links by relevance.
- Enforce hard caps: max pages, max depth, max links per page, max text per page, total text budget.
- Skip blocked file types (PDFs, archives, large media).

Config: `SCRAPER_MAX_PAGES`, `SCRAPER_MAX_DEPTH`, `SCRAPER_MAX_LINKS_PER_PAGE`, `SCRAPER_MAX_TEXT_PER_PAGE`, `SCRAPER_TOTAL_TEXT_CAP`.

## 4. Text Extraction & Opportunity Structuring

Where it is used: `backend/utils/scraper.js`, `backend/scraper-enhanced.js`.

Purpose: convert HTML into clean text and then into a strict opportunity JSON schema.

How it works:
- Strip non-content nodes (`script`, `style`, `nav`, `footer`, `header`, `iframe`, `noscript`).
- Extract visible text and collapse whitespace.
- When thin, apply fallback low-signal extraction.
- Send cleaned text to the LLM (Gemini) with a schema request; expect `title`, `description`, `deadline`, `eligibility`, `url`, `type`, `status`.

Controls: model input text caps and retry/failover behavior when AI provider is unavailable.

## 5. Title Quality Filtering Algorithm

Where it is used: `backend/scraper-enhanced.js` and `backend/api/index.js` (upsert/refresh logic).

Purpose: detect and reject low-signal titles (homepage labels, domain-only, promotional text).

How it works:
- Patterns considered low-signal: exact `Home`, `Homepage`, `Home Page`, domain-like strings, organization-only names, generic CTAs.
- Exceptions when a title contains event signals: `conference`, `workshop`, `webinar`, `contest`, `award`, `program`, `internship`.
- Worker may throw a `parse_error` when no meaningful title is found; API logic can refresh auto/unverified rows when incoming scrape is stronger.

Why: ensures stored records are human-meaningful and searchable.

## 6. Fuzzy Duplicate Detection Algorithm

Where it is used: `backend/api/index.js`, `backend/fuzzy-dedup.js`.

Purpose: detect likely-duplicate opportunities even when wording differs.

How it works:
1. Normalize titles: lowercase, remove punctuation, split into words, remove stopwords (`ieee`, `the`, `and`, `program`, `council`, ...), simple plural stemming.
2. Convert to word sets.
3. Compute subset-style similarity:

$$
	ext{similarity} = \frac{|\text{intersection}|}{\min(|\text{set1}|,|\text{set2}|)}
$$

This score favors superset relationships (one title containing another).

Config: `SCRAPE_MATCH_THRESHOLD` (update-time matching), `DUPLICATE_GROUP_THRESHOLD` (grouping), fuzzy-dedup deeper pass uses ~0.6.

## 7. Duplicate Grouping & Merge Algorithm

Where it is used: `backend/api/index.js` (admin duplicate endpoints).

Purpose: group near-duplicates and recommend a primary record for merge.

How it works:
- Build a graph connecting records whose titles pass the similarity threshold and whose dates are compatible.
- Connected components with size >= 2 are considered duplicate groups.
- Rank candidates for primary record by: verified > manual source > better status (`Live` > `Upcoming` > `Closed`) > field completeness > recency.

Why: consolidates near-duplicates while preserving the best metadata.

## 8. Date Inference & Status Logic

Where it is used: `backend/api/index.js`.

Purpose: infer deadlines and status when structured dates are missing.

How it works:
- Parse explicit dates when present.
- Otherwise, attempt extraction from title/description text using regex heuristics.
- If inferred date < now, mark `Closed`.
- If no date, preserve best-known status or default to `Live`.

Why: improves UX when source pages omit structured metadata.

## 9. Persona & Eligibility Filtering

Where it is used: `backend/api/index.js` (opportunities API).

Purpose: filter out opportunities that don't match the selected persona.

How it works:
- Build persona filter rules and apply before pagination.
- Use regex-based exclusions for explicit conflicts.

Why: ensure feed relevance for filtered audiences.

## 10. Admin Noise Filtering Algorithm

Where it is used: `backend/api/index.js` and `frontend/src/pages/AdminDashboard.jsx`.

Purpose: hide low-signal/noise rows from admin list while preserving raw data.

How it works:
- `excludeNoise=true` causes API to exclude known noise patterns (homepage titles, newsletter headers, generic promos).
- Admin UI enables excludeNoise by default with a toggle to show raw rows.

Why: improves admin focus and reduces visual noise during manual review.

## 11. URL Canonicalization

Where it is used: `backend/api/index.js` and upsert logic.

Purpose: normalize URLs to detect duplicates and avoid noisy variants.

How it works:
- Trim input, remove fragments (`#...`) and query strings, normalize trailing slashes, require http/https.

Why: stabilizes canonical matching.

## 12. Queue Result Retry (Worker)

Where it is used: `backend/scraper-enhanced.js`.

Purpose: avoid data loss when backend API is temporarily unavailable.

How it works:
- On failed send, append result to a local retry queue file.
- Background flush loop retries queued items periodically.
- Note: this queue is best-effort and not durable across ephemeral filesystem restarts.

## 13. Playwright Metrics

Where it is used: `backend/scraper-enhanced.js` and monitoring summaries.

Purpose: distinguish attempted Playwright fallbacks from successful browser fetches.

How it works:
- Track `axiosSuccess`, `playwrightAttempts`, `playwrightUsed` separately and include in periodic summaries.

Why: helps diagnose anti-bot pressure and control costs.

## Why these algorithms combined

They balance three goals: coverage (discover opportunities), quality (filter low-signal titles & deduplicate), and cost-control (limit worker/db pressure and selective browser usage).

## File map (implementation locations)

- `backend/api/index.js` — queue claiming, upsert logic, duplicate grouping, admin endpoints, canonicalization.
- `backend/utils/scraper.js` — bounded crawl and content extraction.
- `backend/fetchPage.js` — Axios + Playwright hybrid fetch.
- `backend/scraper-enhanced.js` — worker loop, title heuristics, local retry queue, Playwright metrics.
- `backend/fuzzy-dedup.js` — deeper cleanup and dedup utilities.

## Notes

- Thresholds and behavior are environment-configurable; tune env vars in `backend/.env` for your deployment.
- For operational runbook, onboarding, and troubleshooting see `ONBOARDING.md`.
