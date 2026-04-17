# IEEE Opportunity Tracker
A full-stack web application designed for IEEE student members to discover competitions, paper contests, hackathons, and grants across 39 IEEE Societies and 8 Technical Councils.

## Tech Stack
- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js (Express -> Vercel Serverless Functions)
- Database: PostgreSQL (Neon) via Prisma
- AI Scraping: Axios + Cheerio + Google Gemini API for Vercel-side extraction, plus a Railway worker that uses Axios with Playwright fallback for the hybrid scrape pipeline

## Scraper Provider Map
- URL sourcing: Organization `scrapeUrls` / `scrapeUrl`, fallback `officialWebsite` (backend + Prisma).
- Vercel admin scrape trigger: enqueue-only, no direct Playwright usage.
- Railway worker fetch provider: Axios first, Playwright fallback via `fetchPage`.
- HTML parsing provider: `cheerio` for the Vercel-side scraper, DOM extraction inside the worker pipeline as needed.
- AI extraction provider: Google Gemini API via `@google/genai`.
- Persistence provider: Prisma ORM writing to Neon PostgreSQL.

## Recent Feature Updates
- Admin scrape now enqueues the organization for the Railway worker instead of running the scrape directly in Vercel.
- Railway worker owns the actual hybrid scraping flow, including Playwright fallback and browser recovery.
- `officialWebsite` now acts as a queue fallback when an organization has no explicit scrape URL.
- DB-level dedup hard stop added with a unique index on canonical opportunity URL.
- Opportunity verification workflow shipped end-to-end:
   - Admin can toggle verification per opportunity (`Verify` action in Admin table)
   - Verified badge/checkmark is shown on cards, detail pages, and overview/feed cards
   - New admin endpoint: `POST /api/admin/opportunities/:id/verify`
- Personalization onboarding shipped (browser-storage based):
   - One-time modal captures persona, region, and interests
   - Preferences are stored locally in browser storage (no DB write)
   - Preferences can be changed later from header `Preferences`
   - Feed defaults are derived from saved preferences
- Opportunities feed filtering upgraded:
   - Type filter supports multi-select checkbox behavior
   - Backend `GET /api/opportunities` now supports `types` (CSV) for multi-type filtering
   - Keyword search now ignores background type-preference filters so exact matches are not hidden
- Homepage `Closing Soon` now respects selected preferences and updates when preferences change.
- Dashboard stat cards are now preference-aware:
   - `Total Tracked`, `Active Now`, `Closing This Week`, and `Organizations` are computed from opportunities matching saved interests
   - counts update immediately when preferences are changed from header `Preferences`
- Persona eligibility filtering is now applied server-side in opportunities API:
   - pass `persona` in `GET /api/opportunities` to exclude ineligible records before pagination
   - example impact: `Non-IEEE Member` hides IEEE-members-only opportunities
   - totals may appear lower after this change because exclusions are intentional
- Directory redesigned into category-centric navigation:
   - category cards, membership cards, region cards with live counts
   - clicking cards navigates to feed with quick filters pre-applied
- Broad dark-mode/readability improvements across:
   - admin dashboard tables/buttons/modals
   - login form inputs
   - opportunities feed/cards/detail pages
- Scraper now supports **safe bounded subsection crawling** to improve opportunity discovery:
   - same-domain internal links only
   - configurable hard limits on pages/depth/links/text budget
   - keyword-based subsection prioritization for opportunity-relevant pages
   - blocked file types skipped (`pdf`, media, archives, office files)
- Closing Soon counts were aligned between dashboard cards, feed labels, and stats API:
   - uses day-boundary 7-day window (start of today through end of day +7)
   - dashboard urgent section now evaluates a broader live dataset before selecting display cards
- Phase 1 Admin Intelligence shipped:
   - Scrape Health dashboard metrics per organization (last status, failures, 7-day success/fail/add counts, success rate)
   - Duplicate Merge tool with grouped candidate detection and safe merge into a selected primary record
   - Admin UI now keeps these heavy sections collapsed by default and expands on demand
   - Admin dashboard data loading is resilient to partial API failures (existing data still renders)
- Scrape health endpoints now include a production-safe fallback if `ScrapeRunLog` migration is pending.
- Opportunity link quality and fallback behavior were improved:
   - drops hard-dead event links (`404`/`410`)
   - ignores generic section roots (e.g., `/events`, `/awards`) as event links
   - if no valid event link remains, falls back to organization link (`officialWebsite`, then first configured scrape URL)
- Opportunity cards/details now show region restriction badges when eligibility text clearly ties participation to a specific country/region.
- Admin dashboard now supports full scrape URL management per organization:
   - add a new scrape URL
   - edit all explicit scrape URLs (one per line)
   - delete individual explicit scrape URLs
   - show `officialWebsite` as labeled fallback URL when no explicit scrape URL exists
- Admin dashboard now supports creating a **new organization** with type, official website, and scrape URLs.
- Admin dashboard now auto-refreshes organizations/opportunities every 30 seconds.
- Admin dashboard now supports noise-aware browsing for opportunities:
   - default view hides common generic page-noise rows (marketing/newsletter/header-like entries)
   - toggle in Admin table allows showing full raw feed when needed
- Backend validates `scrapeUrl` and `officialWebsite` on admin updates (must be valid `http(s)` URLs).
- Scraper now tries all configured scrape URLs for an organization, then falls back to `officialWebsite`.
- Student Activities defaults were corrected to `https://students.ieee.org/`.
- Cron scraping was hardened for Vercel serverless behavior:
   - clearer error if `CRON_SECRET` is missing
   - batch size set to 5 orgs per run
   - configured Vercel backend function `maxDuration` to 60 seconds
- Gemini quota handling improved:
   - returns `429` (instead of generic `500`) when AI quota is exhausted
   - supports multi-key failover across `GEMINI_API_KEY` and `GEMINI_API_KEY_2`

## Phase 1 Endpoints

### Admin Scrape Health (JWT required)
- `GET /api/admin/scrape-health`
- `GET /api/admin/scrape-health/:orgId`

Returns per-organization scrape reliability data:
- `organizationId`, `organizationName`
- `lastScrapedAt`, `lastStatus`, `lastError`
- `success7d`, `failed7d`, `opportunitiesAdded7d`, `successRate`

If migration has not been applied yet, endpoint returns fallback rows with a warning (instead of failing with `500`).

### Admin Duplicate Merge (JWT required)
- `GET /api/admin/duplicates`
- `POST /api/admin/duplicates/merge`

Duplicate detection heuristic:
- same organization
- title similarity threshold
- optional date proximity guard

Merge behavior:
- keeps selected primary opportunity id
- merges best non-empty/newer fields into primary
- deletes selected duplicate ids
- disallows cross-organization merge by default

### Admin Verification (JWT required)
- `POST /api/admin/opportunities/:id/verify`

Payload:
- `{ verified: boolean }`

Behavior:
- toggles verification status for an opportunity
- verification status is reflected in admin table and public UI badges
- does not delete, re-scrape, or auto-fix low-quality titles

### Admin Noise Filtering

Admin dashboard requests opportunities with `excludeNoise=true` by default to suppress generic rows that are commonly scraped from landing pages.

Important behavior:
- This filter changes visibility in admin list views only; it does not delete rows from the database.
- The admin toggle can disable this filter to inspect the full raw feed.
- If permanent removal is needed, use admin delete action or a targeted cleanup operation.

## Feed Query Notes

`GET /api/opportunities` supports both single-type and multi-type filtering:
- `type=Grant` (single type)
- `types=Competition,Grant,Fellowship` (multi-select type filter)
- `excludeNoise=true` (optional: hide common generic page-noise rows)

When keyword search is used in the feed UI, type preference defaults are not forced so exact text matches remain discoverable.

### Why some "Other" rows still appear

Not every `Other` type row is noise. Conference announcements, webinars, calls for papers, nominations, and awards can still be legitimate opportunities and are intentionally retained unless explicitly deleted.

## Client-Side Preference Storage

Onboarding and quick-navigation filters are stored in browser storage:
- `ieee.preferences.v1` -> onboarding profile/preferences
- `ieee.quickFilters.v1` -> one-time handoff filters from Directory to Feed

These are intentionally client-side for privacy/simplicity and can be changed anytime from the app UI.

### Preference-to-Filter Mapping Notes

- Saved interests are normalized into valid opportunity filter types before applying feed filters.
- One interest may map to multiple types (for example, mentorship-related interests can include Fellowship, Workshop, and Webinar).
- This ensures type filter checkboxes in Explore reflect saved interests consistently.

## Project Structure
This repository uses a monorepo structure configured for automated Vercel deployments.
- `/frontend` - Contains the React app
- `/backend` - Contains the Express APIs and Prisma bindings
- `/HANDOVER.md` - Quick continuity and troubleshooting guide for future chats/sessions

## Environment Variables Configuration

The application requires several environment variables to function properly. **How you set these depends on where you are running the app.**

### 1. Local Development (`.env` files)
For local development, you should create `.env` files in your project. Do not commit these files to version control.

**In the root `opportunity-tracker/.env` AND `opportunity-tracker/backend/.env`:**
\`\`\`env
# PostgreSQL connection string from Neon (required for Prisma)
NEON_DATABASE_URL="postgres://user:password@endpoint.neon.tech/neondb?sslmode=require"

# Your Google Gemini API Key
GEMINI_API_KEY="AIzaSy..."

# Secret used to sign admin JWTs (can be any random string locally)
JWT_SECRET="your_secret_development_key"

# Admin login credentials
ADMIN_USERNAME="admin"
# bcrypt hash for "admin123" (or your preferred password)
ADMIN_PASSWORD_HASH="$2a$10$YourHashedPasswordHere..."
\`\`\`

**In `opportunity-tracker/frontend/.env`:**
\`\`\`env
# The URL for the backend API.
# During local development with Vite server running on port 5173 and backend on port 3000:
VITE_API_URL="http://localhost:3000/api" 
\`\`\`

### 2. Vercel Deployment

When deploying to Vercel, **you do not use `.env` files.** Instead, you must add these variables directly in the Vercel Dashboard for your project.

1. Go to your project on Vercel -> **Settings** -> **Environment Variables**.
2. Add the following keys and their corresponding values (same as your local setup):
   - \`NEON_DATABASE_URL\`
   - \`GEMINI_API_KEY\`
   - `GEMINI_API_KEY_2` (optional, recommended for quota failover)
   - `GEMINI_API_KEYS` (optional CSV list for more than two keys)
   - \`JWT_SECRET\` (Use a strong, secure random string for production)
   - \`ADMIN_USERNAME\`
   - \`ADMIN_PASSWORD_HASH\`
   - \`CRON_SECRET\` (Required for authenticated Vercel cron calls)
   - `SCRAPER_MAX_PAGES` (optional, defaults to 8)
   - `SCRAPER_MAX_DEPTH` (optional, defaults to 1)
   - `SCRAPER_MAX_LINKS_PER_PAGE` (optional, defaults to 10)
   - `SCRAPER_MAX_TEXT_PER_PAGE` (optional, defaults to 3000)
   - `SCRAPER_TOTAL_TEXT_CAP` (optional, defaults to 12000)
3. **Important for Frontend:** Add the following key to let the React app know where the API is hosted in production:
   - \`VITE_API_URL\` = \`/api\`  *(Since Vercel serves the API on the same domain as the frontend, a relative path is required).*

### 3. Railway Worker (Low-Usage Free-Tier Preset)

If you are running the scraper worker on Railway and Neon free-tier limits are tight, use this conservative preset.

```env
# Required
API_SECRET=<must match backend SCRAPER_API_SECRET>
API_URL=https://<your-backend-domain>

# Throughput / concurrency
MAX_CONCURRENT=1
BATCH_SIZE=2

# Polling / dedup windows
IDLE_SLEEP_MS=900000
URL_SEEN_COOLDOWN_MS=21600000

# Fetch pacing
PAGE_TIMEOUT_MS=30000
REQUEST_DELAY_MIN_MS=3000
REQUEST_DELAY_MAX_MS=8000

# API send retry pressure
API_SEND_RETRIES=1
API_SEND_BACKOFF_BASE_MS=3000
```

Ultra-safe profile (if limits are still exhausted):
- `BATCH_SIZE=1`
- `API_SEND_RETRIES=0`
- keep `MAX_CONCURRENT=1`

Notes:
- `API_SEND_RETRIES=2` with small backoff can increase write pressure during transient failures.
- A larger `URL_SEEN_COOLDOWN_MS` reduces repeat processing of the same URLs.

### Free-Tier Quick Start Checklist

Use this checklist when running on Railway + Neon free-tier:

1. Set worker env vars to low-usage preset.
2. Deploy and restart worker once after env update.
3. In Admin, keep `Hide generic page-noise rows` enabled.
4. Run small scrape batches first (single org or small subset).
5. Watch logs for retry spikes and repeated send failures.

If limits are exhausted:

1. Switch to ultra-safe mode (`BATCH_SIZE=1`, `API_SEND_RETRIES=0`).
2. Pause scraping until quota reset window.
3. Resume with one-org test scrape, then scale gradually.

## Local Development Setup

1. **Install Dependencies**
   Navigate to both `frontend` and `backend` and run `npm install`.

2. **Database Setup**
   Ensure `NEON_DATABASE_URL` is set in the `/opportunity-tracker` root `.env` or in the backend's `.env`.
   ```bash
   cd backend
   npx prisma generate
   npx prisma migrate deploy
   node prisma/seed.js
   ```

   For local schema iteration during development, `npx prisma migrate dev` is recommended.

3. **Run Locally**
   - Start Backend: `cd /home/sreyas/projects/ieee/opportunity-tracker/backend && npm run dev` (Runs on `localhost:3000`)
   - Start Frontend: `cd /home/sreyas/projects/ieee/opportunity-tracker/frontend && npm run dev` (Runs on `localhost:5173`)
   *Note: Frontend vite.config.js automatically proxies `/api` to `localhost:3000`.*

If you run `npm run dev` from `/home/sreyas/projects/ieee`, npm will fail with `ENOENT` because there is no `package.json` at that level.

## Deployment to Vercel

1. Push your monorepo code to a GitHub repository.
2. In Vercel, import the repository.
3. Configure the Root Directory to the base of the monorepo (where `vercel.json` exists).
4. Add all required Environment Variables into Vercel Project Settings.
5. Deploy! Vercel will automatically use `vercel.json` to build the static React frontend and configure the `api/` serverless functions.

## Cron Scraping Operations

### Manual cron health test
Use your real production secret, not the placeholder text:

```bash
curl -H "Authorization: Bearer <REAL_CRON_SECRET>" \
   https://<your-domain>/api/cron/scrape-batch
```

Expected response: JSON object containing `message` and `results`.

### Common errors
- `401 Unauthorized CRON request`: secret mismatch or missing auth header.
- `500 CRON_SECRET is missing`: add `CRON_SECRET` in Vercel env vars and redeploy.
- `Cannot GET /api/cron/scrape-batch`: old deployment is serving; deploy latest commit and verify project root/repo settings.
- `429 Google AI quota/rate-limit exceeded`: Gemini key(s) exhausted; wait for reset or configure secondary key(s).

### If Neon free-tier limit is exhausted
1. Apply the Railway low-usage preset above.
2. Keep admin dashboard open only when needed (auto-refresh still causes periodic DB reads).
3. Use manual scrape runs in smaller batches instead of sustained high-throughput scraping.

## Admin Organization Management

- Add organization: available from Admin via `Add Org` (name, type, official website, scrape URLs).
- Manage scrape URLs per org:
   - Add URL button adds one explicit scrape URL.
   - Pencil button edits full explicit URL list.
   - X button deletes one explicit URL.
- Fallback behavior:
   - If no explicit scrape URLs are configured, scraper uses `officialWebsite`.
   - The fallback URL is displayed in Admin with a `fallback` label.

## Production Troubleshooting

### If latest frontend/backend changes are not visible
1. Verify Vercel project points to `psreyas09/ieee` and production branch `main`.
2. Verify root directory is correct for this monorepo (`opportunity-tracker`).
3. Ensure `Automatic Production Deployments` is enabled.
4. Ensure no `Ignored Build Step` is blocking deploys.
5. Deploy latest commit explicitly (or use `vercel --prod` from `opportunity-tracker/`).
6. Ensure `frontend/dist` build artifacts are not tracked in git (source should be built by Vercel).

### If Student Activities scrape fails with 404
Run this SQL once in production Neon DB:

```sql
UPDATE "Organization"
SET "scrapeUrl" = 'https://students.ieee.org/'
WHERE "name" = 'IEEE Student Activities';
```

Then retry scraping from Admin.

### If `/api/admin/scrape-health` returns `500`
This usually means the new `ScrapeRunLog` table migration has not been applied to production DB.

Run in backend:
```bash
npx prisma migrate deploy
```

Then redeploy/restart backend.

### If closing-soon cards and count look different
Latest logic is aligned to a day-based 7-day window. If mismatch persists in production:
1. Ensure the latest `main` deployment is live.
2. Hard refresh browser cache.
3. Confirm backend and frontend are from the same release.

### If opportunities still show old/missing links
Recent link fallback logic applies on create/update during scrape runs. Existing rows may keep older `url` values until refreshed:
1. Trigger a fresh scrape for the affected organization.
2. Verify organization has `officialWebsite` or at least one explicit scrape URL configured.
