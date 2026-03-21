# IEEE Opportunity Tracker
A full-stack web application designed for IEEE student members to discover competitions, paper contests, hackathons, and grants across 39 IEEE Societies and 8 Technical Councils.

## Tech Stack
- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js (Express -> Vercel Serverless Functions)
- Database: PostgreSQL (Neon) via Prisma
- AI Scraping: Cheerio API & Google Gemini 2.5 Flash

## Recent Feature Updates
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
- Admin dashboard now supports full scrape URL management per organization:
   - add a new scrape URL
   - edit all explicit scrape URLs (one per line)
   - delete individual explicit scrape URLs
   - show `officialWebsite` as labeled fallback URL when no explicit scrape URL exists
- Admin dashboard now supports creating a **new organization** with type, official website, and scrape URLs.
- Admin dashboard now auto-refreshes organizations/opportunities every 30 seconds.
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
# During local development with Vite server running on port 5173 and backend on try 3000:
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
   - Start Backend: `cd backend && npm run dev` (Runs on `localhost:3000`)
   - Start Frontend: `cd frontend && npm run dev` (Runs on `localhost:5173`)
   *Note: Frontend vite.config.js automatically proxies `/api` to `localhost:3000`.*

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
