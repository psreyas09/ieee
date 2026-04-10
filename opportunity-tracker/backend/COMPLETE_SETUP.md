# Complete Setup Guide: Railway Scraper + Vercel Backend

## Important Status (April 2026)
- This guide was written for an earlier integration stage and contains outdated setup/auth assumptions.
- Current system state:
  - Admin scrape does not scrape directly; it enqueues organization work.
  - Railway worker performs scraping and reports success/failure telemetry.
  - Queue fallback uses `officialWebsite` when explicit scrape URLs are missing.
  - DB canonical URL uniqueness is enforced (`unique_opportunity`).

For current setup/runbook, use:
- `backend/RAILWAY_QUICK_START.md`
- `README.md`
- `DOCUMENTATION.md`

Treat the remaining content below as historical reference only.

## Overview

Your system will have:
- **Vercel Backend** (existing): API endpoints on vercel.app
- **Railway Worker** (new): Web scraper running every 5 minutes
- **Connection**: Scraper fetches URLs from Vercel, sends results back to Vercel

---

## PHASE 1: Prepare Vercel Backend (10 minutes)

### Step 1: Add API Endpoints for Scraper

Your Vercel API needs two new endpoints that the scraper will use:

#### 1A: Create `/api/admin/scrape-queue` endpoint

**Why**: Scraper needs to know which URLs to process

**File to edit**: `backend/api/index.js`

Add this endpoint (put it after other `/api/admin/` routes):

```javascript
// GET /api/admin/scrape-queue
// Returns list of URLs that need to be scraped
app.get('/api/admin/scrape-queue', authenticateAdmin, async (req, res) => {
  try {
    // Get organizations that have scrape URLs configured
    const orgs = await prisma.organization.findMany({
      where: {
        scrapeUrl: { not: null },
      },
      select: {
        id: true,
        scrapeUrl: true,
      },
      take: 10, // Limit to 10 organizations per batch
    });

    // Extract individual URLs
    const urls = [];
    for (const org of orgs) {
      const urlList = org.scrapeUrl.split('\n').filter(Boolean);
      urlList.forEach(url => {
        urls.push({
          url: url.trim(),
          organizationId: org.id,
        });
      });
    }

    res.json({
      count: urls.length,
      urls: urls.map(u => u.url), // Just the URLs
      metadata: urls, // For reference
    });
  } catch (error) {
    console.error('[scrape-queue] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

#### 1B: Create `/api/admin/scrape-result` endpoint

**Why**: Scraper sends extracted opportunities here

**Add this endpoint**:

```javascript
// POST /api/admin/scrape-result
// Receives scraped opportunity data and saves to database
app.post('/api/admin/scrape-result', authenticateAdmin, async (req, res) => {
  try {
    const { opportunity } = req.body;

    if (!opportunity || !opportunity.url) {
      return res.status(400).json({ error: 'Invalid opportunity data' });
    }

    // Check if opportunity already exists
    const existing = await prisma.opportunity.findFirst({
      where: { url: opportunity.url },
    });

    if (existing) {
      // Update existing opportunity
      const updated = await prisma.opportunity.update({
        where: { id: existing.id },
        data: {
          title: opportunity.title || existing.title,
          description: opportunity.description || existing.description,
          deadline: opportunity.deadline || existing.deadline,
          cost: opportunity.cost || existing.cost,
          scrapedAt: new Date(),
        },
      });
      return res.json({ success: true, action: 'updated', id: updated.id });
    }

    // Create new opportunity
    const created = await prisma.opportunity.create({
      data: {
        url: opportunity.url,
        title: opportunity.title || 'Untitled',
        description: opportunity.description || '',
        deadline: opportunity.deadline ? new Date(opportunity.deadline) : null,
        cost: opportunity.cost || 'unspecified',
        organizationId: opportunity.organizationId,
        source: 'scraper',
        scrapedAt: new Date(),
      },
    });

    res.json({ success: true, action: 'created', id: created.id });
  } catch (error) {
    console.error('[scrape-result] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### Step 2: Deploy to Vercel

```bash
cd backend
git add -A
git commit -m "Add scraper API endpoints"
git push origin main

# Vercel auto-deploys on push
# Check: https://vercel.com/dashboard → your project → deployments
```

---

## PHASE 2: Set Up Railway (15 minutes)

### Step 1: Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Click **New Project**
3. Select **GitHub Repo** → Select `opportunity-tracker`
4. Click **Deploy now**

Wait for initial deployment to complete (~2 minutes)

### Step 2: Configure for Scraper Service

#### 2A: Update Start Command

In Railway project dashboard:
1. Click **Settings** (gear icon)
2. Find **Start Command**
3. Change to:
   ```
   cd backend && npm install && npm run scraper
   ```

#### 2B: Set Environment Variables

In Railway → **Variables**:

Add these (copy from your Vercel backend):

```
API_URL=https://your-vercel-app.vercel.app
API_SECRET=your_admin_jwt_secret_from_backend_env

# Optional:
JOB_INTERVAL=300000
BATCH_SIZE=5
```

**How to get these:**

For `API_URL`:
- Go to Vercel dashboard → your project → Settings → Domains
- Copy the production domain (e.g., `https://my-app.vercel.app`)

For `API_SECRET`:
- This is your JWT secret from Vercel `.env.local`
- In `backend/api/index.js`, it's used for: `jwt.sign(..., process.env.JWT_SECRET, ...)`
- Add to Vercel env: `JWT_SECRET=your-secret-key`

### Step 3: Deploy

```bash
# In your local terminal
git push origin main

# Railway will auto-detect changes and redeploy
# Check Railway dashboard for logs
```

---

## PHASE 3: Implement Scraper Functions (20 minutes)

### Step 1: Implement fetchURLQueue()

**File**: `backend/scraper-enhanced.js`, around line 215

Replace this:
```javascript
async function fetchURLQueue() {
  try {
    console.log('[Scraper] Fetching URL queue from API...');
    return []; // EMPTY - REPLACE THIS
  } catch (error) {
    log('error', 'Queue', 'Failed to fetch URL queue', { error: error.message });
    return [];
  }
}
```

With this:
```javascript
async function fetchURLQueue() {
  try {
    log('info', 'Queue', 'Fetching URL queue from API', { endpoint: '/api/admin/scrape-queue' });

    const response = await axios.get(`${API_URL}/api/admin/scrape-queue`, {
      headers: {
        Authorization: `Bearer ${API_SECRET}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const urls = response.data.urls || [];
    log('info', 'Queue', 'Fetched URLs', { count: urls.length });

    return urls;
  } catch (error) {
    log('error', 'Queue', 'Failed to fetch URL queue', {
      error: error.message,
      status: error.response?.status,
    });
    return [];
  }
}
```

### Step 2: Implement processHTML()

**File**: `backend/scraper-enhanced.js`, around line 180

Replace this:
```javascript
async function processHTML(html, url) {
  log('info', 'Processing', 'Analyzing HTML', { url });

  // IMPLEMENT: Replace with real Cheerio + Gemini pipeline
  return {
    title: 'Extracted Title',
    description: 'Extracted description from HTML',
    opportunity: {
      url,
      title: 'Sample Opportunity',
      description: 'Sample description',
      deadline: null,
      cost: 'unspecified',
    },
  };
}
```

With this:
```javascript
const cheerio = require('cheerio');

async function processHTML(html, url) {
  try {
    log('info', 'Processing', 'Extracting from HTML', { url, size: html.length });

    // Parse HTML
    const $ = cheerio.load(html);

    // Extract basic fields
    const title = $('h1, h2, .title, [role="heading"]')
      .first()
      .text()
      .trim()
      .substring(0, 200);

    const description = $('[data-description], .description, .content, article p, main p')
      .map((i, el) => $(el).text().trim())
      .get()
      .join(' ')
      .substring(0, 2000);

    // FOR NOW: Return extracted data directly
    // (You can add Gemini API call here later for structured output)

    return {
      title: title || 'Untitled Opportunity',
      description: description || 'No description available',
      opportunity: {
        url,
        title: title || 'Untitled Opportunity',
        description: description || 'No description available',
        deadline: null, // Can parse from HTML later
        cost: 'unspecified', // Can use cost classifier later
      },
    };
  } catch (error) {
    log('error', 'Processing', 'Failed to process HTML', {
      url,
      error: error.message,
    });

    return {
      title: 'Failed to extract',
      description: error.message,
      opportunity: {
        url,
        title: 'Failed to extract',
        description: error.message,
        deadline: null,
        cost: 'unspecified',
      },
    };
  }
}
```

### Step 3: Deploy Updated Scraper

```bash
cd backend
git add -A
git commit -m "Implement fetchURLQueue and processHTML"
git push origin main

# Railway auto-redeploys
# Check logs in Railway dashboard
```

---

## PHASE 4: Testing (15 minutes)

### Step 1: Test Locally First

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
API_URL=https://your-vercel-api.vercel.app
API_SECRET=your-jwt-secret
JOB_INTERVAL=300000
BATCH_SIZE=5
EOF

# Run scraper in dev mode
npm run scraper:dev

# Watch for log output
# Should see: "Browser initialized successfully"
# Then: "Job started"
```

### Step 2: Monitor Railway Logs

```bash
# In another terminal, watch Railway logs
railway logs --follow

# Expected output (in JSON):
{
  "timestamp": "2024-04-02T10:30:00Z",
  "level": "info",
  "component": "Scraper",
  "message": "Starting Web Scraper Worker"
}

{
  "timestamp": "2024-04-02T10:30:05Z",
  "level": "info",
  "component": "Browser",
  "message": "Browser initialized successfully"
}

{
  "timestamp": "2024-04-02T10:30:10Z",
  "level": "info",
  "component": "Queue",
  "message": "Fetched URLs",
  "count": 5
}

{
  "timestamp": "2024-04-02T10:30:45Z",
  "level": "info",
  "component": "Job",
  "message": "Job completed"
}
```

### Step 3: Verify Data in Vercel Database

1. Check your PostgreSQL database in Vercel
2. Query the `opportunities` table
3. Should see new entries with `source: 'scraper'`

---

## PHASE 5: Configuration Details

### API_SECRET vs JWT_SECRET

These are related:

**In Vercel Backend** (`backend/.env`):
```
JWT_SECRET=your-super-secret-key-12345
```

**In Railway** (`API_SECRET`):
```
API_SECRET=your-super-secret-key-12345  # SAME AS JWT_SECRET
```

The scraper uses this JWT secret to authenticate with the Vercel API.

### API_URL Configuration

**For local testing**:
```
API_URL=http://localhost:3000
```

**For Railway to Vercel**:
```
API_URL=https://your-vercel-domain.vercel.app
```

---

## PHASE 6: Troubleshooting

### Issue: "Failed to fetch URL queue" Error

**Cause**: API_SECRET is wrong or API_URL is unreachable

**Fix**:
1. Verify API_URL is correct in Railway variables
2. Verify API_SECRET matches JWT_SECRET in Vercel
3. Test manually:
   ```bash
   curl -X GET https://your-api.vercel.app/api/admin/scrape-queue \
     -H "Authorization: Bearer YOUR_SECRET"
   ```

### Issue: Browser Initialization Error

**Cause**: Chromium can't start (memory issue)

**Fix**:
1. On free Railway tier, reduce BATCH_SIZE to 3
2. Or increase JOB_INTERVAL to 600000 (10 min)

### Issue: No Results in Database

**Checklist**:
1. Are URLs being fetched? Check logs for "Fetched URLs"
2. Are pages being processed? Check logs for "Processing URL"
3. Is scraper-result endpoint responding? Test locally:
   ```bash
   curl -X POST http://localhost:3000/api/admin/scrape-result \
     -H "Authorization: Bearer YOUR_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"opportunity":{"url":"https://test.com","title":"Test"}}'
   ```

### Issue: High Memory Usage

**Solution**:
```
# In Railway Variables:
JOB_INTERVAL=900000   # Every 15 min instead of 5
BATCH_SIZE=3          # Fewer URLs per batch
```

---

## PHASE 7: Next Steps (Optional Improvements)

### After Basic Setup Works:

1. **Add Gemini API for structured extraction**:
   ```javascript
   // In processHTML(), send to Gemini for better data extraction
   const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
   ```

2. **Add deadline extraction**:
   ```javascript
   // Parse deadline from HTML using date patterns
   const deadline = extractDate(html);
   ```

3. **Add cost classification**:
   ```javascript
   // Use your costClassification utility from frontend
   const cost = getCostInfo(description);
   ```

4. **Add error notifications**:
   ```javascript
   // Send Slack/email alerts on failures
   await notifyOnError(error);
   ```

---

## PHASE 8: Free Tier Management

### Current Setup on Free Tier

- JOB_INTERVAL: 300000 (5 min)
- BATCH_SIZE: 5
- Estimated: ~50 URLs/hour
- Cost: **$0** (free tier)

### When Upgrading to Paid (Later)

Just change two variables:

```
JOB_INTERVAL=3600000    # Every hour
BATCH_SIZE=20           # More URLs per batch
```

Code doesn't change, just configuration!

---

## Complete Checklist

- [ ] Add `/api/admin/scrape-queue` endpoint to Vercel
- [ ] Add `/api/admin/scrape-result` endpoint to Vercel
- [ ] Deploy Vercel changes
- [ ] Create Railway project
- [ ] Set start command in Railway
- [ ] Add environment variables in Railway (API_URL, API_SECRET)
- [ ] Implement fetchURLQueue() in scraper
- [ ] Implement processHTML() in scraper
- [ ] Deploy to Railway
- [ ] Test locally with `npm run scraper:dev`
- [ ] Monitor Railway logs
- [ ] Verify data appears in Vercel database
- [ ] Document API_SECRET in your notes

---

## Quick Command Reference

```bash
# Deploy everything
git add -A
git commit -m "Setup web scraper"
git push origin main

# Test scraper locally
cd backend
npm run scraper:dev

# View Railway logs
railway logs --follow

# View logs from last 24 hours
railway logs --until=24h

# Show all env vars
railway env

# Deploy manually from local
railway deploy
```

---

## File Locations for Reference

```
Your Vercel Backend:
  backend/api/index.js          # Add endpoints here
  backend/.env                  # JWT_SECRET defined here

Your Railway Scraper:
  backend/scraper-enhanced.js   # Implement fetchURLQueue() + processHTML()
  backend/browserManager.js     # Playwright lifecycle
  backend/fetchPage.js          # Axios/Playwright hybrid

Documentation:
  backend/IMPLEMENTATION.md     # Overview
  backend/RAILWAY_QUICK_START.md # Quick setup
  backend/SCRAPER_README.md     # Architecture details
```

---

## Summary

You now have:
1. ✅ Vercel API endpoints for scraper communication
2. ✅ Railway worker configured
3. ✅ Scraper functions implemented
4. ✅ Testing & troubleshooting guide
5. ✅ Free tier configuration

**Total time: ~60 minutes from start to working scraper** 🚀

Ready to start? Begin with **PHASE 1: Add Vercel endpoints**
