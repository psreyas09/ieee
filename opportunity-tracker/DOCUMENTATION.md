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
- `Opportunity`: scraped and manual opportunities
- `AdminUser`: admin authentication records

## Scraping Pipeline

### Ingestion flow
1. Choose target URL: `scrapeUrl` first, fallback to `officialWebsite`.
2. Fetch HTML with browser-like headers.
3. Remove non-content tags and extract body text.
4. Limit extracted content length for model safety.
5. Prompt Gemini for strict JSON output.
6. Parse and upsert opportunities.

### Model strategy
- Primary: `gemini-2.5-flash-lite`
- Fallback: `gemini-2.5-flash`
- Retry logic for temporary errors (`429`, `503`, transient fetch errors)

### Deduplication
- Title similarity uses normalized token overlap with stop-word filtering.
- Near-duplicate opportunities are updated instead of duplicated.

## Admin Capabilities

- Secure login via JWT (`/api/admin/login`)
- Trigger scrape per organization (`/api/admin/scrape/:id`)
- Sequential "Scrape All" from UI
- CRUD for manual opportunities
- Update organization data (`/api/admin/organizations/:id`)
- Edit scrape URL directly in dashboard UI (pencil action)

## Recent Reliability and UX Additions

1. Added **Edit Scrape URL** admin action in UI.
2. Added backend validation for organization URLs (`http(s)` only).
3. Added scraper fallback from `scrapeUrl` to `officialWebsite` on `404`.
4. Corrected Student Activities default scrape URL to `https://students.ieee.org/`.
5. Hardened cron endpoint behavior:
	 - explicit error when `CRON_SECRET` is missing
	 - reduced batch size to 1 org per run to reduce timeout risk
	 - Vercel function `maxDuration` set to 60s for backend function

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
- `PUT /api/admin/organizations/:id`

### System
- `GET /api/cron/scrape-batch` (requires `Authorization: Bearer <CRON_SECRET>`)
- `GET /api/admin/force-seed` (manual patch utility route when deployed)

## Deployment Notes (Vercel)

### Required environment variables
- `NEON_DATABASE_URL`
- `GEMINI_API_KEY`
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
