# Opportunity Tracker Handover

This file is a quick restart guide for future chats and contributors.

## Current State (March 2026)
- Branch: `main`
- Deployment target: Vercel (`https://ieee-eosin.vercel.app`)
- Backend: Express + Prisma + Neon PostgreSQL
- Frontend: React + Vite + Tailwind

## Phase 1 Features Implemented
- Scrape Health dashboard (admin):
  - `GET /api/admin/scrape-health`
  - `GET /api/admin/scrape-health/:orgId`
- Duplicate Merge tool (admin):
  - `GET /api/admin/duplicates`
  - `POST /api/admin/duplicates/merge`
- Scrape run logging model:
  - Prisma model: `ScrapeRunLog`
  - Migration: `backend/prisma/migrations/202603150001_phase1_scrape_health_duplicates/migration.sql`

## Important Recent Fixes
- Admin dashboard no longer blanks when one section API fails.
- Scrape health endpoint has fallback behavior when `ScrapeRunLog` table is missing.
- Gemini scraper model updated for API deprecation readiness:
  - primary: `gemini-3.1-flash-lite-preview`
  - fallback: `gemini-3.1-flash`
- Scraper now does safe bounded subsection crawling:
  - same-domain only
  - depth/page/text caps
  - keyword-prioritized links
  - binary/document links skipped
- Scraper now returns clear anti-bot message when all subsection attempts are 403.
- Closing soon count/feed mismatch fixed by aligning to day-boundary 7-day logic.
- Opportunity URL pipeline now filters low-quality links (generic roots, hard-dead links) and falls back to organization URL when event URL is unavailable.
- Region restriction badges now rely on eligibility + geography signals to reduce false positives while still labeling clear cases (e.g., `Uganda Only`).

## Scraper Safety Knobs (optional env vars)
- `SCRAPER_MAX_PAGES` (default `8`)
- `SCRAPER_MAX_DEPTH` (default `1`)
- `SCRAPER_MAX_LINKS_PER_PAGE` (default `10`)
- `SCRAPER_MAX_TEXT_PER_PAGE` (default `3000`)
- `SCRAPER_TOTAL_TEXT_CAP` (default `12000`)

## Production DB + Migration Notes
- Runtime should use pooled Neon URL in Vercel env vars.
- Migrations are safer with direct Neon URL.
- If Prisma migrate cannot run from local but schema is needed:
  - Execute migration SQL directly in Neon SQL editor.
  - Then mark migration applied if needed:
    - `npx prisma migrate resolve --applied 202603150001_phase1_scrape_health_duplicates`

## Verify Scrape Health Quickly
1. Login to get JWT:
   - `POST /api/admin/login`
2. Call health endpoint with token (no angle brackets):
   - `Authorization: Bearer REAL_TOKEN`
3. Trigger a few scrapes to generate non-zero `success7d/failed7d`.

## Frequent Gotchas
- `Invalid or expired token`: token expired or sent with literal `< >`.
- `P3005`: DB is not empty; baseline workflow needed.
- `P1001`: transient/direct DB connectivity or TLS param mismatch.
- 403 scrape failures are often anti-bot blocking by target websites.

## Recommended First Checks in New Chat
1. Confirm branch/deploy status:
   - `git status -sb`
   - `git log --oneline --decorate -n 5`
2. Test backend health route(s) and admin login.
3. Check Neon table exists:
   - `SELECT to_regclass('public."ScrapeRunLog"');`
4. Review primary docs:
   - `README.md`
   - `DOCUMENTATION.md`
   - `HANDOVER.md`
