# Railway Quick Start (Current)

## 1) Service Setup
- Repository: ieee
- Root Directory: opportunity-tracker/backend
- Builder: Dockerfile (enabled)
- Dockerfile Path: Dockerfile
- Start Command: leave empty (Dockerfile CMD starts scraper-enhanced.js)

## 2) Required Variables
Set these in Railway:
- API_URL=https://your-vercel-app.vercel.app
- API_SECRET=<same value as Vercel SCRAPER_API_SECRET>

Recommended worker tuning (free tier):
- IDLE_SLEEP_MS=300000
- MAX_CONCURRENT=1
- BATCH_SIZE=5
- PAGE_TIMEOUT_MS=30000
- REQUEST_DELAY_MIN_MS=1500
- REQUEST_DELAY_MAX_MS=4000
- API_SEND_RETRIES=2
- API_SEND_BACKOFF_BASE_MS=1000
- URL_SEEN_COOLDOWN_MS=3600000
- ANTI_BOT_COOLDOWN_MS=21600000

Optional:
- AXIOS_INSECURE_SSL=false
- PROXY_SERVER, PROXY_USERNAME, PROXY_PASSWORD

## 3) Vercel Must Be Ready First
Ensure these API endpoints are deployed:
- GET /api/admin/scrape-queue
- POST /api/admin/scrape-result
- POST /api/admin/scrape-failure

And set Vercel variables:
- SCRAPER_API_SECRET
- JWT_SECRET
- NEON_DATABASE_URL
- GEMINI_API_KEY (or GEMINI_API_KEYS)

## 4) Deploy
- Push latest changes to main branch
- Trigger Railway deploy (or wait for auto-deploy)

## 5) Confirm Healthy Startup
Expected log sequence:
- Starting Web Scraper Worker
- Browser initialized successfully
- Fetching URL queue from API
- No jobs. Sleeping... OR Processing queue

## 5b) Admin Scrape Behavior
- Admin "Scrape" now enqueues the organization for the Railway worker instead of scraping directly in Vercel.
- The worker is the only path that runs the hybrid fetch pipeline (`Axios -> Playwright fallback`).
- If an organization has no explicit scrape URL, the queue falls back to `officialWebsite` when it is valid.

## 6) Validate End-to-End
- One successful URL should show:
  - Success with Axios OR Success with Playwright
  - Result sent (status 200)
- Blocked URLs should show:
  - errorType: anti_bot
  - Skipped due to anti-bot cooldown (on next attempts)
- Admin-triggered scrapes should show queueing in the UI, then be processed later by the worker.

## 7) Common Problems
- API returns HTML instead of JSON:
  - Wrong Vercel project/domain or route configuration mismatch
- 401 from queue/result endpoints:
  - Railway API_SECRET does not match Vercel SCRAPER_API_SECRET
- Browser launch fails with missing libs:
  - Dockerfile not being used
- Queue items stay at 0:
  - No eligible organizations (cooldown active or missing scrape URLs)

## 8) Fast Operational Tips
- Add or edit scrape URLs, or rely on `officialWebsite` fallback when no explicit scrape URL exists
- Enqueue orgs from Admin for immediate pickup by the worker
- Keep MAX_CONCURRENT low on free tier
- Treat anti-bot failures as expected partial-failure behavior
- Local queue file is best-effort only on container restarts
