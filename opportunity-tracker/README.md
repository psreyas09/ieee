# IEEE Opportunity Tracker
A full-stack web application designed for IEEE student members to discover competitions, paper contests, hackathons, and grants across 39 IEEE Societies and 8 Technical Councils.

## Tech Stack
- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js (Express -> Vercel Serverless Functions)
- Database: PostgreSQL (Neon) via Prisma
- AI Scraping: Cheerio API & Google Gemini 2.5 Flash

## Recent Feature Updates
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

## Project Structure
This repository uses a monorepo structure configured for automated Vercel deployments.
- `/frontend` - Contains the React app
- `/backend` - Contains the Express APIs and Prisma bindings

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
   npx prisma db push
   node prisma/seed.js
   ```

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
