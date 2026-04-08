# Scraper Summary (Current State)

## Overview
This project now runs a production-style scraping pipeline with:
- Vercel API as the control plane and persistence layer
- Railway worker as the scraper runtime
- Playwright in Docker for browser reliability
- Hybrid fetch strategy (Axios first, Playwright fallback)

## Current Architecture
- Queue source: organizations in DB with scrape URLs and cooldown eligibility
- Queue endpoint: GET /api/admin/scrape-queue
- Result endpoint: POST /api/admin/scrape-result
- Worker loop: queue-driven sleep loop (no fixed cron spam)
- Browser lifecycle: one reusable browser instance, page-per-request

## Components
- backend/scraper-enhanced.js
  - Queue polling and processing loop
  - Retry + backoff for API delivery
  - Anti-bot cooldown skip logic
  - Browser health recovery
  - Local best-effort retry queue (.scraper-queue.jsonl)

- backend/fetchPage.js
  - Axios fast path
  - Playwright fallback path
  - Block-page detection (including small challenge pages)

- backend/browserManager.js
  - Playwright launch and restart handling
  - Low-memory-friendly launch args for Railway

- backend/api/index.js
  - /api/admin/scrape-queue claim-on-fetch logic
  - /api/admin/scrape-result validation + ingestion
  - Admin organization enqueue/delete improvements

## Deployment Model
### Vercel
- Hosts frontend + backend API endpoints
- Worker-facing endpoints are protected by SCRAPER_API_SECRET

### Railway
- Runs only scraper worker
- Uses Dockerfile (required for Playwright system libraries)
- Root Directory: opportunity-tracker/backend
- Dockerfile Path: Dockerfile

## Required Environment Variables
### Vercel
- JWT_SECRET
- SCRAPER_API_SECRET
- NEON_DATABASE_URL
- GEMINI_API_KEY (or GEMINI_API_KEYS)

Optional queue tuning:
- SCRAPE_QUEUE_COOLDOWN_MS (default 3600000)
- SCRAPE_QUEUE_ORG_LIMIT (default 5)
- SCRAPE_QUEUE_URLS_PER_ORG (default 2)
- SCRAPE_QUEUE_TOTAL_URL_LIMIT (default 5)

### Railway
- API_URL (your Vercel base URL)
- API_SECRET (must match Vercel SCRAPER_API_SECRET)

Worker tuning:
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

Optional TLS fallback (use carefully):
- AXIOS_INSECURE_SSL=false

## Gemini Model Configuration
Current defaults in backend/utils/scraper.js:
- Primary: gemini-3.1-flash-lite-preview
- Fallback: gemini-3-flash-preview

Can be overridden via:
- GEMINI_PRIMARY_MODEL
- GEMINI_FALLBACK_MODEL

## What Is Working
- Queue fetch and claim behavior
- End-to-end ingestion for successful scrapes
- Hybrid fallback (Axios -> Playwright)
- Anti-bot classification and cooldown skipping
- Browser restart recovery after disconnect
- Organization delete and enqueue admin flows

## Known Limitations
- Some IEEE domains are heavily anti-bot protected and may fail even with Playwright
- Local retry queue file is non-durable across container restarts
- Worker currently uses mock HTML-to-opportunity extraction in scraper-enhanced.js unless customized

## Recommended Next Improvements
1. Add durable DB-backed retry queue (replace local file fallback)
2. Add blocked-domain backoff persistence (DB)
3. Replace mock processHTML with full Cheerio + Gemini extraction pipeline
4. Add dashboard controls for enqueue and block cooldown insights

## Quick Validation Checklist
1. Vercel:
   - GET /api/stats returns JSON
   - GET /api/admin/scrape-queue returns 401 without token
2. Railway:
   - Browser initialized successfully in logs
   - Fetch queue items appears periodically
3. End-to-end:
   - At least one URL processes to Result sent status 200
   - Anti-bot URLs classify as anti_bot and enter cooldown
