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

### Backend
- Node.js + Express exposed via Vercel serverless routes
- Prisma ORM with PostgreSQL (Neon)
- JWT-protected admin APIs
- Scraper pipeline with Axios + Cheerio + Gemini models

### Database Models
- `Organization`: source entities and scrape metadata (`scrapeUrl`, `officialWebsite`, `lastScrapedAt`)
	- `scrapeUrl` now supports multiple explicit URLs stored as newline-delimited values and exposed as `scrapeUrls[]` in API responses
- `Opportunity`: scraped and manual opportunities
- `AdminUser`: admin authentication records
- `ScrapeRunLog`: scrape run telemetry (`organizationId`, `startedAt`, `endedAt`, `status`, `errorMessage`, `opportunitiesFound`, `opportunitiesAdded`, `source`)

## Scraping Pipeline

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
- Primary: `gemini-2.5-flash-lite`
- Fallback: `gemini-2.5-flash`
- Retry logic for temporary errors (`429`, `503`, transient fetch errors)
- Multi-key failover across `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, or `GEMINI_API_KEYS` CSV
- Returns explicit quota metadata when both models/keys are exhausted (`429`, `retryAfterSec`)

### Deduplication
- Title similarity uses normalized token overlap with stop-word filtering.
- Near-duplicate opportunities are updated instead of duplicated.

## Admin Capabilities

- Secure login via JWT (`/api/admin/login`)
- Trigger scrape per organization (`/api/admin/scrape/:id`)
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

## Recent Reliability and UX Additions

1. Added **Edit Scrape URL** admin action in UI.
2. Added backend validation for organization URLs (`http(s)` only).
3. Added scraper fallback from `scrapeUrl` to `officialWebsite` on `404`.
4. Corrected Student Activities default scrape URL to `https://students.ieee.org/`.
5. Hardened cron endpoint behavior:
	 - explicit error when `CRON_SECRET` is missing
	 - batch size increased to 5 orgs per run
	 - Vercel function `maxDuration` set to 60s for backend function
6. Improved Gemini quota behavior:
	 - returns `429` for quota exhaustion in admin scrape endpoint
	 - includes `retryAfterSec` when available from provider response
	 - rotates/fails over to secondary configured key(s)
7. Seed and maintenance safety:
	 - `seed.js` is idempotent/non-destructive for organizations and admin user
	 - `/api/admin/force-seed` no longer overwrites existing custom Student Activities scrape URL
8. Phase 1 reliability + dedup tooling:
	 - scrape run logging added to both manual scrape and cron scrape flows
	 - scrape health APIs provide 7-day success/failure/add metrics and last error visibility
	 - duplicate detection groups opportunities and recommends primary record
	 - merge endpoint safely consolidates duplicates into one primary record
9. Production hardening:
	 - scrape health endpoint no longer hard-fails if `ScrapeRunLog` migration is pending; returns fallback payload with warning
	 - admin dashboard uses partial-load fetch strategy so one failing section does not blank the full page
10. Count consistency fix:
	 - closing-soon stats API and dashboard urgent list now share day-boundary 7-day logic to reduce count/card mismatch
11. Link trust and continuity improvements:
	 - scraper no longer stores generic listing roots as opportunity links
	 - hard-dead links are filtered before save
	 - missing/invalid event links now fallback to organization-level URL
12. Region restriction visibility:
	 - cards and detail pages show `Region Restricted`/`<Place> Only` badges when eligibility text clearly ties participants to a country or region
	 - generic wording without concrete geography is intentionally not flagged

## API Surface (Key Endpoints)

### Public
- `GET /api/stats`
- `GET /api/organizations`
- `GET /api/opportunities`
- `GET /api/opportunities/:id`

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

### Monorepo settings
- Repository: `psreyas09/ieee`
- Production branch: `main`
- Root directory: `opportunity-tracker`
- Ensure automatic production deployments are enabled
- Ensure ignored build step is empty unless intentionally used
- Keep `frontend/dist` untracked in git to avoid stale static assets overriding fresh builds

## Operations Runbook

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
