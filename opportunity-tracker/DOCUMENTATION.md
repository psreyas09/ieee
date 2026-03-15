# IEEE Opportunity Tracker - System Documentation

This document summarizes the current architecture, data flow, admin operations, and production runbook.

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

## Scraping Pipeline

### Ingestion flow
1. Choose target URLs: all explicit `scrapeUrls` (or parsed `scrapeUrl`) first, then `officialWebsite` fallback.
2. Fetch HTML with browser-like headers.
3. Remove non-content tags and extract body text.
4. Limit extracted content length for model safety.
5. Prompt Gemini for strict JSON output.
6. Parse and upsert opportunities.

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

## API Surface (Key Endpoints)

### Public
- `GET /api/stats`
- `GET /api/organizations`
- `GET /api/opportunities`
- `GET /api/opportunities/:id`

### Admin (JWT required)
- `POST /api/admin/login`
- `POST /api/admin/scrape/:id`
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
