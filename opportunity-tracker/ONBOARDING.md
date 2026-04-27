# Developer Onboarding — Opportunity Tracker

This onboarding document contains developer quick-start, run instructions, operational runbook snippets, and troubleshooting tips. It was moved from `ALGORITHMS.md` so the latter can contain algorithms-only content.

## Quick start (developer)

Clone, install, and run locally (recommended: Node 18+). Quick commands:

```bash
git clone <repo-url>
cd opportunity-tracker
# install backend and frontend deps
cd backend && npm install
cd ../frontend && npm install
```

Environment and database (development):

```bash
# Copy env example, set DATABASE_URL and any API keys (Gemini) and ADMIN_TOKEN
cp backend/.env.example backend/.env
# Run migrations and seed (Prisma)
cd backend
npx prisma migrate dev
node prisma/seed.js
```

Run backend and frontend in development:

```bash
# backend
cd backend && npm run dev
# frontend (vite)
cd ../frontend && npm run dev
```

Run the worker locally (scraper):

```bash
cd backend
node scraper-enhanced.js
```

If you need to run cleanup utilities used by admins, see `backend/cleanup-targeted-low-signal.js`.

Note: exact npm scripts and filenames live in `backend/package.json` and `frontend/package.json`.

## Project purpose & high level architecture

The Opportunity Tracker crawls, extracts, and normalizes opportunity postings (events, grants, internships, calls) across organization sites. Key components:
- API server: Express + Prisma (`backend/`)
- Scraper worker: hybrid fetcher + extraction + LLM structuring (`backend/scraper-enhanced.js`, `backend/fetchPage.js`)
- Frontend: React + Vite admin and public UI (`frontend/src`)
- Database: PostgreSQL (Neon) via Prisma

Data flow (high level):
1. Admin or scheduler enqueues orgs/URLs to scrape via API.
2. Worker claims small batches from `/api/admin/scrape-queue` and fetches pages.
3. Fetch uses Axios first, Playwright fallback when necessary.
4. Extracted text is normalized and sent to Gemini to produce structured JSON.
5. Backend upserts opportunity records, running deduplication and title-quality checks.

## Operational runbook (common tasks)

Re-scrape an organization (fast path):

1. In admin UI open the organization and click the re-scrape action (or call the admin enqueue API).
2. Worker will claim the org when it polls `/api/admin/scrape-queue`.

Force a targeted re-scrape from terminal (dev):

```bash
# in backend
node api/scripts/enqueueOrg.js --orgId=<org-id>
# or use curl against the admin API with ADMIN_TOKEN header
curl -H "Authorization: Bearer $ADMIN_TOKEN" -X POST "http://localhost:3000/api/admin/enqueue" -d '{"org":"example.org"}'
```

Cleanup low-signal titles (safe pattern):

1. Run `backend/cleanup-targeted-low-signal.js` in dry-run mode to list candidates.
2. Review the sample results carefully.
3. Re-run with confirm flag to delete small safe batches.

Example (dry-run):

```bash
node backend/cleanup-targeted-low-signal.js --dry
```

Check metrics and logs:

- Worker logs show `playwrightAttempts` and `playwrightUsed` counters.
- Backend periodic summaries include counts of failed sends and retries.

Low-usage mode (free-tier recommendations):

- Set `SCRAPE_QUEUE_COOLDOWN_MS` high (hours) to reduce re-enqueue pressure.
- Limit `SCRAPE_QUEUE_ORG_LIMIT`, `SCRAPE_QUEUE_URLS_PER_ORG`, `SCRAPE_QUEUE_TOTAL_URL_LIMIT` to small numbers (1–3).
- Admin UI: default hide-noise is enabled to avoid heavy queries; auto-refresh interval increased to 5 minutes.

## Troubleshooting & common fixes

- Worker stuck or no progress:
  - Check worker logs for unhandled exceptions.
  - Verify database connectivity (`DATABASE_URL`).
  - If the local retry queue grows, inspect the queue file and examine recent API errors.

- Many low-quality titles still appear:
  - Check `isLowSignalTitle` patterns in `backend/scraper-enhanced.js` and the API refresh logic in `backend/api/index.js`.
  - Re-run targeted re-scrapes for affected orgs.

- Playwright costs or failures:
  - Inspect `fetchPage.js` and Playwright metrics. Playwright is attempted only when Axios fails.
  - If Playwright is failing frequently, examine network restrictions or set longer timeouts.

## References (important files)

- `backend/api/index.js`
- `backend/fetchPage.js`
- `backend/scraper-enhanced.js`
- `backend/utils/scraper.js`
- `backend/fuzzy-dedup.js`
- `frontend/src/pages/AdminDashboard.jsx`

This file was generated from the expanded onboarding content previously in `ALGORITHMS.md`.