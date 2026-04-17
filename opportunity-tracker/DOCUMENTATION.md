# IEEE Opportunity Tracker - System Documentation

This document summarizes the current architecture, data flow, admin operations, and production runbook.

For quick continuity between chats/sessions, see `HANDOVER.md` in the repository root.

## Overview

IEEE Opportunity Tracker is a full-stack platform that aggregates IEEE student opportunities (competitions, grants, hackathons, paper contests, workshops, and related events) into one searchable feed.

## Architecture

### Frontend
- React + Vite + Tailwind CSS
- React Router for app navigation
- Axios client with JWT auth interceptor
- Admin dashboard for scraping and manual data operations
- Admin dashboard supports optional noise-aware opportunity listing (hide generic landing-page rows)

### Backend
- Node.js + Express exposed via Vercel serverless routes
- Prisma ORM with PostgreSQL (Neon)
- JWT-protected admin APIs
- Vercel admin scrape trigger is enqueue-only
- Railway worker runs the hybrid scraper pipeline with Axios first and Playwright fallback
- Scraper pipeline with Axios + Cheerio + Gemini models for the Vercel-side extraction path

### Database Models
- `Organization`: source entities and scrape metadata (`scrapeUrl`, `officialWebsite`, `lastScrapedAt`)
	- `scrapeUrl` now supports multiple explicit URLs stored as newline-delimited values and exposed as `scrapeUrls[]` in API responses
- `Opportunity`: scraped and manual opportunities
- `AdminUser`: admin authentication records
- `ScrapeRunLog`: scrape run telemetry (`organizationId`, `startedAt`, `endedAt`, `status`, `errorMessage`, `opportunitiesFound`, `opportunitiesAdded`, `source`)

## Scraping Pipeline

### Provider map (what is used for each step)
1. URL source selection:
	- provider: backend logic + Prisma `Organization` fields (`scrapeUrls`/`scrapeUrl`/`officialWebsite`)
2. Web fetch:
	- provider: `axios` HTTP client (+ Node `https` agent)
3. HTML/content extraction:
	- provider: `cheerio`
4. AI structuring/extraction:
	- provider: Google Gemini API via `@google/genai`
	- primary model: `gemini-3.1-flash-lite-preview`
	- fallback model: `gemini-3.1-flash`
5. Validation + link quality checks:
	- provider: backend URL validators and lightweight HTTP status checks
6. Persistence:
	- provider: Prisma ORM -> Neon PostgreSQL

### Ingestion flow
1. Choose target URLs: all explicit `scrapeUrls` (or parsed `scrapeUrl`) first, then `officialWebsite` fallback.
2. Perform safe bounded subsection crawl:
	 - same-domain links only
	 - keyword-prioritized internal links
	 - hard limits for depth/pages/links/text budget
	 - skip non-HTML/document/media file extensions
3. Fetch HTML with browser-like headers.
4. Remove non-content tags and extract body text.
5. Limit extracted content length for model safety.
6. Prompt Gemini for strict JSON output.
7. Parse and upsert opportunities.

### Opportunity URL selection (during upsert)
- Validate model-provided event URL.
- Reject generic section/listing roots (e.g., `/events`, `/awards`, `/news`) as non-specific event links.
- Drop hard-dead links (`404`/`410`) using lightweight URL checks.
- If no valid event URL remains, fallback to organization URL in this order:
	1. `officialWebsite`
	2. first configured explicit scrape URL

### Model strategy
- Primary: `gemini-3.1-flash-lite-preview`
- Fallback: `gemini-3.1-flash`
- Retry logic for temporary errors (`429`, `503`, transient fetch errors)
- Multi-key failover across `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, or `GEMINI_API_KEYS` CSV
- Returns explicit quota metadata when both models/keys are exhausted (`429`, `retryAfterSec`)

### Deduplication
- Title similarity uses normalized token overlap with stop-word filtering.
- Near-duplicate opportunities are updated instead of duplicated.

## Admin Capabilities

- Secure login via JWT (`/api/admin/login`)
- Trigger scrape per organization (`/api/admin/scrape/:id`) now enqueues the org for the Railway worker
- Sequential "Scrape All" from UI
- Auto-refresh of dashboard data every 30 seconds
- CRUD for manual opportunities
- Create organization (`/api/admin/organizations`)
- Update organization data (`/api/admin/organizations/:id`)
- Add explicit scrape URL (`/api/admin/organizations/:id/scrape-urls`)
- Delete explicit scrape URL (`/api/admin/organizations/:id/scrape-urls`)
- UI supports add/edit/delete for explicit scrape URLs and shows fallback website URL
- Scrape Health section with sortable reliability table and failed-only quick filter
- Duplicate Merge panel with grouped duplicate candidates, selectable primary record, and merge action
- Scrape Health and Duplicate Merge sections are collapsed by default and expand on button click
- Opportunities table defaults to noise-filtered mode and can be toggled to view full raw feed

### Verification semantics
- `Verify` only toggles `verified` state on an opportunity.
- It does not delete rows and does not trigger re-scraping.
- Use delete actions (or cleanup scripts) for permanent removal.

## Recent Reliability and UX Additions

1. Switched admin scraping to enqueue-only so the Railway worker is the single execution path for actual scraping.
2. Added `officialWebsite` fallback when an organization has no explicit scrape URL.
3. Added DB-level unique canonical URL enforcement for opportunities.

4. Added **Edit Scrape URL** admin action in UI.
5. Added backend validation for organization URLs (`http(s)` only).
6. Added scraper fallback from `scrapeUrl` to `officialWebsite` on `404`.
7. Corrected Student Activities default scrape URL to `https://students.ieee.org/`.
8. Hardened cron endpoint behavior:
	 - explicit error when `CRON_SECRET` is missing
	 - batch size increased to 5 orgs per run
	 - Vercel function `maxDuration` set to 60s for backend function
9. Improved Gemini quota behavior:
	 - returns `429` for quota exhaustion in admin scrape endpoint
	 - includes `retryAfterSec` when available from provider response
	 - rotates/fails over to secondary configured key(s)
10. Seed and maintenance safety:
	 - `seed.js` is idempotent/non-destructive for organizations and admin user
	 - `/api/admin/force-seed` no longer overwrites existing custom Student Activities scrape URL
11. Phase 1 reliability + dedup tooling:
	 - scrape run logging added to both manual scrape and cron scrape flows
	 - scrape health APIs provide 7-day success/failure/add metrics and last error visibility
	 - duplicate detection groups opportunities and recommends primary record
	 - merge endpoint safely consolidates duplicates into one primary record
12. Production hardening:
	 - scrape health endpoint no longer hard-fails if `ScrapeRunLog` migration is pending; returns fallback payload with warning
	 - admin dashboard uses partial-load fetch strategy so one failing section does not blank the full page
13. Count consistency fix:
	 - closing-soon stats API and dashboard urgent list now share day-boundary 7-day logic to reduce count/card mismatch
14. Link trust and continuity improvements:
	 - scraper no longer stores generic listing roots as opportunity links
	 - hard-dead links are filtered before save
	 - missing/invalid event links now fallback to organization-level URL
15. Region restriction visibility:
	 - cards and detail pages show `Region Restricted`/`<Place> Only` badges when eligibility text clearly ties participants to a country or region
	 - generic wording without concrete geography is intentionally not flagged
16. Verification lifecycle:
	 - admin can toggle opportunity verification state from dashboard table
	 - verified badge appears in admin + public cards/detail views
	 - endpoint added: `POST /api/admin/opportunities/:id/verify`
17. Preference-driven personalization (client-side):
	 - first-run onboarding captures persona, region, and interests
	 - preferences are stored locally in browser storage (no DB persistence)
	 - preferences can be reopened/edited via header action
	 - homepage and feed now adapt defaults from saved preferences
18. Feed filtering upgrades:
	 - type filtering supports true multi-select behavior
	 - backend opportunities API supports CSV `types` query param
	 - text search ignores background type-preference constraints so exact matches are discoverable
19. Directory redesigned as category navigation:
	 - category cards, membership cards, region cards with live counts
	 - card interactions navigate to feed with pre-applied quick filters
20. Preference-aware dashboard summary cards:
	 - `Total Tracked`, `Active Now`, `Closing This Week`, and `Organizations` are computed from opportunities that match saved preference-derived types
	 - these counters update when preferences are changed via the header preferences modal
	 - interest selections are normalized to valid opportunity types so Explore type checkboxes remain aligned with saved interests
21. Persona eligibility filtering (server-side):
	 - opportunities API now supports `persona` query and applies eligibility exclusion rules before pagination
	 - this prevents ineligible opportunities (for example, IEEE-members-only items for `Non-IEEE Member`) from leaking into later pages
	 - dashboard/feed totals can decrease after persona filtering because ineligible records are intentionally removed from result sets
22. Admin noise filtering support:
	 - opportunities API accepts `excludeNoise=true` to suppress common landing-page/newsletter/promotional rows
	 - admin dashboard consumes this mode by default, with a toggle to inspect unfiltered results
	 - filter is non-destructive (visibility only), preserving data for audit/recovery

## API Surface (Key Endpoints)

### Public
- `GET /api/stats`
- `GET /api/organizations`
- `GET /api/opportunities`
- `GET /api/opportunities/:id`

`GET /api/opportunities` query support includes:
- `type=<singleType>` for single type filtering
- `types=<csv>` for multi-type filtering (example: `types=Competition,Grant,Fellowship`)
- `persona=<personaLabel>` for eligibility-aware filtering (for example: `Non-IEEE Member`, `Undergraduate Student`, `Graduate Student`, `Young Professional`)
- `excludeNoise=true` for hiding generic page-noise rows (optional; primarily used by admin table views)

Notes:
- `excludeNoise` is intended for list quality/readability, not for hard deletion.
- Some `Other` items remain valid opportunities (for example: conference calls, society awards, and nomination notices).

### Admin (JWT required)
- `POST /api/admin/login`
- `POST /api/admin/scrape/:id`
- `GET /api/admin/scrape-health`
- `GET /api/admin/scrape-health/:orgId`
- `GET /api/admin/duplicates`
- `POST /api/admin/duplicates/merge`
- `POST /api/admin/opportunities`
- `PUT /api/admin/opportunities/:id`
- `DELETE /api/admin/opportunities/:id`
- `POST /api/admin/opportunities/:id/verify`
- `POST /api/admin/organizations`
- `PUT /api/admin/organizations/:id`
- `POST /api/admin/organizations/:id/scrape-urls`
- `DELETE /api/admin/organizations/:id/scrape-urls`

### System
- `GET /api/cron/scrape-batch` (requires `Authorization: Bearer <CRON_SECRET>`)
- `GET /api/admin/force-seed` (manual patch utility route when deployed)

## Deployment Notes (Vercel)

### Required environment variables
- `NEON_DATABASE_URL`
- `GEMINI_API_KEY`
- `GEMINI_API_KEY_2` (optional)
- `GEMINI_API_KEYS` (optional CSV for multi-key rotation)
- `SCRAPER_MAX_PAGES` (optional; default `8`)
- `SCRAPER_MAX_DEPTH` (optional; default `1`)
- `SCRAPER_MAX_LINKS_PER_PAGE` (optional; default `10`)
- `SCRAPER_MAX_TEXT_PER_PAGE` (optional; default `3000`)
- `SCRAPER_TOTAL_TEXT_CAP` (optional; default `12000`)
- `JWT_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `CRON_SECRET`
- `VITE_API_URL` (`/api` for same-domain deployment)

### Optional worker tuning variables (Railway)
- `BATCH_SIZE` (default in low-usage profile: `2`)
- `MAX_CONCURRENT` (recommended: `1` for free tier)
- `IDLE_SLEEP_MS` (recommended: `900000`)
- `URL_SEEN_COOLDOWN_MS` (recommended: `21600000`)
- `REQUEST_DELAY_MIN_MS` (recommended: `3000`)
- `REQUEST_DELAY_MAX_MS` (recommended: `8000`)
- `PAGE_TIMEOUT_MS` (recommended: `30000`)
- `API_SEND_RETRIES` (recommended: `1`; ultra-safe `0`)
- `API_SEND_BACKOFF_BASE_MS` (recommended: `3000`)

### Monorepo settings
- Repository: `psreyas09/ieee`
- Production branch: `main`
- Root directory: `opportunity-tracker`
- Ensure automatic production deployments are enabled
- Ensure ignored build step is empty unless intentionally used
- Keep `frontend/dist` untracked in git to avoid stale static assets overriding fresh builds

## Operations Runbook

### Free-tier low-usage profile (Railway + Neon)
Use this preset to reduce DB/compute pressure:

```env
MAX_CONCURRENT=1
BATCH_SIZE=2
IDLE_SLEEP_MS=900000
URL_SEEN_COOLDOWN_MS=21600000
REQUEST_DELAY_MIN_MS=3000
REQUEST_DELAY_MAX_MS=8000
PAGE_TIMEOUT_MS=30000
API_SEND_RETRIES=1
API_SEND_BACKOFF_BASE_MS=3000
```

If limits are still exhausted, switch to ultra-safe mode:
- `BATCH_SIZE=1`
- `API_SEND_RETRIES=0`

Rationale:
- Lower batch/concurrency reduces bursts of write operations.
- Longer idle/dedup windows reduce repeated queue polling and URL reprocessing.
- Lower retries avoid duplicate delivery pressure during transient backend/network issues.

### Quick-start operations checklist (free tier)

1. Apply low-usage worker preset values.
2. Restart worker after env changes.
3. Keep admin usage minimal (open only when needed).
4. Scrape in small batches before running broad org coverage.
5. Check logs for frequent retries and repeated send failures.

If quota is exhausted:

1. Switch to ultra-safe mode:
	- `BATCH_SIZE=1`
	- `API_SEND_RETRIES=0`
2. Wait for quota reset.
3. Resume with one organization first, then increase slowly.

### Client preference storage keys
- `ieee.preferences.v1`: onboarding preferences (persona, region, interests)
- `ieee.quickFilters.v1`: one-shot filter handoff (Directory -> Opportunities)

These keys are browser-local by design and are not synced to DB.

### Validate cron endpoint
```bash
curl -H "Authorization: Bearer <REAL_CRON_SECRET>" \
	https://<domain>/api/cron/scrape-batch
```

Expected: JSON with `message` and `results`.

### Common failure signatures
- `401 Unauthorized CRON request`: bad/missing auth secret.
- `500 CRON_SECRET is missing`: add env var and redeploy.
- `Cannot GET /api/cron/scrape-batch`: old deployment or wrong project settings.
- `npm error enoent ... /home/.../package.json`: command executed from wrong directory. Run backend commands from `opportunity-tracker/backend` and frontend commands from `opportunity-tracker/frontend`.

### Student Activities URL correction (one-time DB patch)
```sql
UPDATE "Organization"
SET "scrapeUrl" = 'https://students.ieee.org/'
WHERE "name" = 'IEEE Student Activities';
```

### Scrape Health migration prerequisite (production)
If scrape health endpoint reports a warning/fallback or previously returned `500`, apply migrations to create `ScrapeRunLog`:

```bash
cd backend
npx prisma migrate deploy
```
