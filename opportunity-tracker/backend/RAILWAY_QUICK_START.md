# Railway Deployment Quick Start

## 5-Minute Setup

### Step 1: Add GitHub Integration
1. Go to [railway.app](https://railway.app)
2. Create new project → GitHub repo
3. Select `opportunity-tracker` repo

### Step 2: Configure Start Command
In Railway project settings:
```
Service: backend
Start Command: npm run scraper
Root Directory: backend
```

### Step 3: Add Environment Variables
Railway → Variables:
```
API_URL=https://your-vercel-api.vercel.app
API_SECRET=your-secret-from-backend
JOB_INTERVAL=300000   (optional, 5 min for dev, 3600000 for prod)
BATCH_SIZE=10         (optional, 10 default)
```

### Step 4: Deploy
```bash
git push origin main
# Railway auto-deploys within ~2 minutes
```

### Step 5: Monitor
```bash
railway logs --follow
# Watch for startup messages and errors
```

---

## Verify it's Working

```bash
railway logs --follow | grep '"level":"info"'
# Should see: "Job started", "Browser initialized", "Metrics"
```

Expected startup logs:
```json
{"timestamp":"2024-01-15T10:30:00Z","level":"info","component":"Config","message":"Validation passed"}
{"timestamp":"2024-01-15T10:30:01Z","level":"info","component":"Scraper","message":"Starting Web Scraper Worker"}
{"timestamp":"2024-01-15T10:30:05Z","level":"info","component":"Browser","message":"Browser initialized successfully"}
{"timestamp":"2024-01-15T10:30:05Z","level":"info","component":"Scraper","message":"Scheduling recurring jobs","intervalMs":3600000}
```

---

## Which Version to Use?

### `scraper.js` (Basic)
- 286 lines
- Clean code, good for learning
- Missing critical fixes
- **Not recommended for production**

### `scraper-enhanced.js` (Production)
- 370 lines
- Includes all 6 critical fixes
- Browser crash recovery
- Request deduplication
- **Use this for Railway**

### How to Switch
In Railway project settings, change start command:
```
# Instead of:
npm run scraper

# Use:
node backend/scraper-enhanced.js
```

Or in package.json, add:
```json
"scraper-prod": "node scraper-enhanced.js"
```

---

## Required Implementation

### 1. fetchURLQueue() - Get URLs to Scrape
Currently returns empty list. You need to implement:

```javascript
async function fetchURLQueue() {
  try {
    const response = await axios.get(
      `${API_URL}/api/admin/scrape-queue`,
      {
        headers: { Authorization: `Bearer ${API_SECRET}` },
        timeout: 10000,
      }
    );
    return response.data.urls || [];
  } catch (error) {
    log('error', 'Queue', 'Failed to fetch', { error: error.message });
    return [];
  }
}
```

**What it should return**:
```javascript
[
  "https://opportunity1.com",
  "https://opportunity2.com",
  "https://opportunity3.com",
]
```

### 2. processHTML() - Extract Data
Currently returns mock. You need to implement your Cheerio + Gemini pipeline:

```javascript
const cheerio = require('cheerio');

async function processHTML(html, url) {
  const $ = cheerio.load(html);
  
  // Extract fields
  const title = $('h1').first().text().trim();
  const description = $('.description').text().trim();
  
  // Send to Gemini for structured output
  const geminiResult = await geminiClient.generateContent({
    contents: [{
      role: 'user',
      parts: [{ text: `Extract opportunity data:\n${description}` }]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          deadline: { type: 'string' },
          cost: { 
            type: 'string',
            enum: ['free', 'paid', 'reimbursement', 'mixed', 'unspecified']
          },
        }
      }
    },
  });
  
  const parsed = JSON.parse(geminiResult.response.text());
  
  return {
    title: parsed.title,
    description,
    opportunity: {
      url,
      title: parsed.title,
      description,
      deadline: parsed.deadline,
      cost: parsed.cost,
    },
  };
}
```

---

## Optional: Proxy Setup

If target sites block direct connections:

### Railway Environment Variables
```
PROXY_SERVER=http://proxy.example.com:8080
PROXY_USERNAME=your-proxy-user
PROXY_PASSWORD=your-proxy-pass
```

Browser will auto-use proxy for all requests.

---

## Troubleshooting

### Issue: "Browser not initialized"
**Cause**: Browser startup failed, probably out of memory  
**Fix**: Reduce BATCH_SIZE in env vars (try 5 instead of 10)

### Issue: "All requests return 403"
**Cause**: Site is detecting bot  
**Fix**: Check logs for "Playwright" in output (fallback is working)

### Issue: "Memory grows to 1GB+"
**Cause**: Pages not being garbage collected  
**Fix**: Upgrade to scraper-enhanced.js (has context rotation)

### Issue: "Results not appearing in API"
**Cause**: 
1. fetchURLQueue() returns empty
2. processHTML() not sending to real API
3. API_SECRET is wrong

**Fix**: 
1. Implement real fetchURLQueue()
2. Implement real processHTML()
3. Check API_SECRET matches backend

### Issue: "Browser crashes after 1 hour"
**Cause**: Chromium out of memory  
**Fix**: 
1. Reduce BATCH_SIZE
2. Increase JOB_INTERVAL to 7200000 (2 hours)
3. Add memory limits:

```json
// In Railway, set
MEMORY_LIMIT=1024MB
```

---

## Monitoring

### Railway Built-in Dashboard
- Memory usage
- CPU usage
- Network I/O
- Logs

### Custom Metrics (in scraper logs every 5 minutes)
```json
{
  "timestamp": "2024-01-15T11:00:00Z",
  "level": "info",
  "component": "Metrics",
  "message": "Scraper status",
  "uptime": "30m",
  "memoryMb": 245,
  "processed": 150,
  "successful": 142,
  "failed": 8,
  "avgFetchMs": 2340,
  "errorTypes": {
    "anti_bot": 3,
    "timeout": 2,
    "network_error": 3
  }
}
```

### What to Watch For
- ✅ `processed` increasing (URLs being scraped)
- ✅ `successful` > 90% (success rate should be high)
- ✅ `memoryMb` < 500 (stable memory usage)
- ❌ `failed` > 50 (investigate errors)
- ❌ `memoryMb` > 700 (memory leak)
- ❌ No logs for > 30 min (scraper running but jobs are done)

---

## Restart the Service

If you need to restart the scraper:

```bash
# Railway CLI
railway logs --follow  # See restart

# Or in Railway dashboard:
# Service → Restart
```

On restart, scraper-enhanced.js will:
1. Check for `.scraper-queue.jsonl` (previous failures)
2. Attempt to flush pending results to API
3. Resume normal operation

---

## Performance Expectations

**Typical metrics per 1-hour job**:
- 100 URLs processed
- ~95% success rate (95 results sent)
- ~2.3 seconds per URL (includes delays, rendering)
- Memory usage: 200-300MB stable
- CPU: 40-60% during job, 0% idle

**Time per URL breakdown**:
- Axios fetch: 0.5-1s (if successful)
- Playwright fallback: 3-5s (if needed)
- Random delays: 2-5s between requests
- HTML processing: 0.2s
- API POST: 0.1s

---

## Cost on Railway

**Pricing (as of 2024)**:
- $5/month per service (always on)
- $0.037 per vCPU-hour
- $0.015 per GB-hour

For this scraper running continuously:
- ~$5 base
- ~$15/month CPU (running ~40% of time)
- ~$10/month memory
- **Total: ~$30/month**

To reduce costs:
- Set `JOB_INTERVAL=7200000` (run every 2 hours instead of 1)
- Reduce `BATCH_SIZE=5` (less memory per batch)
- Schedule only during work hours (requires cron service)

---

## Debugging: Enable Verbose Logs

In Railway, add:
```
DEBUG=*
```

This enables Playwright debug output (very verbose, ~1MB per job).

---

## Commands

```bash
# Local testing
npm install
npm run scraper:dev        # Auto-reload on code changes
npm run scraper            # Single run

# After deploying to Railway
railway logs --follow      # Watch logs
railway env               # View env vars
railway logs --until=24h  # Last 24 hours
railway logs --grep="error" # Filter errors

# Restart service
railway service restart backend
```

---

## Next Steps After Deployment

1. **Confirm scraper is running**:
   - Check Railway logs for "Job started"
   - Verify no "Browser initialization error"

2. **Implement URL queue**:
   - Create `/api/admin/scrape-queue` endpoint in Vercel backend
   - Returns list of opportunity URLs to scrape

3. **Implement HTML processing**:
   - Connect to real Cheerio + Gemini pipeline
   - Test with sample URL

4. **Monitor for 24 hours**:
   - Watch memory (should stay < 500MB)
   - Check success rate (should be > 90%)
   - Review any error patterns

5. **Set up alerts** (optional):
   - Email if service goes down
   - Slack notification if error rate > 10%

---

## Success Criteria

Scraper is working correctly if:
- ✅ Logs appear every `JOB_INTERVAL` seconds
- ✅ CPU spikes during job, returns to idle after
- ✅ Memory stays 200-400MB
- ✅ No "Error" logs (warnings OK)
- ✅ Results appear in your backend database
- ✅ Browser doesn't crash
- ✅ Can restart without data loss

You're done! 🎉
