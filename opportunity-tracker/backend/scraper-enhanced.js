/**
 * ENHANCED Production Web Scraper Worker
 * Version with critical bug fixes applied:
 * - Browser crash recovery
 * - Request deduplication  
 * - Config validation
 * - API unreachable fallback queue
 * - Structured logging
 * - Graceful error handling
 */

require('dotenv').config();
const fs = require('fs').promises;
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const browserManager = require('./browserManager');
const { fetchPage } = require('./fetchPage');

// Configuration from environment
const API_URL = process.env.API_URL || 'http://localhost:3000';
const API_SECRET = process.env.API_SECRET || '';
const PROXY_SERVER = process.env.PROXY_SERVER || null;
const PROXY_USERNAME = process.env.PROXY_USERNAME || null;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || null;
const IDLE_SLEEP_MS = parseInt(process.env.IDLE_SLEEP_MS || '300000', 10); // 5 minutes when queue is empty
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const MAX_CONCURRENT = Math.max(1, Math.min(parseInt(process.env.MAX_CONCURRENT || '2', 10), 3));
const API_SEND_RETRIES = Math.max(0, parseInt(process.env.API_SEND_RETRIES || '2', 10));
const API_SEND_BACKOFF_BASE_MS = Math.max(200, parseInt(process.env.API_SEND_BACKOFF_BASE_MS || '1000', 10));
const URL_SEEN_COOLDOWN_MS = Math.max(60000, parseInt(process.env.URL_SEEN_COOLDOWN_MS || '3600000', 10));
const ANTI_BOT_COOLDOWN_MS = Math.max(300000, parseInt(process.env.ANTI_BOT_COOLDOWN_MS || '21600000', 10));
const REQUEST_DELAY_MIN_MS = Math.max(500, parseInt(process.env.REQUEST_DELAY_MIN_MS || '1500', 10));
const REQUEST_DELAY_MAX_MS = Math.max(REQUEST_DELAY_MIN_MS + 250, parseInt(process.env.REQUEST_DELAY_MAX_MS || '4000', 10));
const FETCH_HARD_TIMEOUT_MS = Math.max(10000, parseInt(process.env.FETCH_HARD_TIMEOUT_MS || '45000', 10));
const BLOCKED_DOMAINS = new Set(
  String(process.env.BLOCKED_DOMAINS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
);

// Proxy configuration
const proxyConfig =
  PROXY_SERVER && PROXY_SERVER.trim()
    ? {
        server: PROXY_SERVER,
        username: PROXY_USERNAME,
        password: PROXY_PASSWORD,
      }
    : {};

// State management
const processedUrlTimestamps = new Map(); // URL -> last processed timestamp
const blockedUrlCooldown = new Map(); // URL -> blockedUntil timestamp
const resultsQueuePath = path.join(__dirname, '.scraper-queue.jsonl');
let lastBrowserCheck = Date.now();
let isShuttingDown = false;
let metrics = {
  processed: 0,
  successful: 0,
  failed: 0,
  axiosSuccess: 0,
  playwrightUsed: 0,
  totalFetchTime: 0,
  errors: {},
};

let metricsWindow = {
  axiosSuccess: 0,
  playwrightUsed: 0,
  failures: 0,
};

/**
 * Simple structured logging
 */
function log(level, component, message, data = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...data,
  };
  console.log(JSON.stringify(logEntry));
}

/**
 * Validate configuration on startup
 */
function validateConfig() {
  const required = ['API_URL', 'API_SECRET'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  if (!API_URL.startsWith('http')) {
    throw new Error(`Invalid API_URL: ${API_URL}`);
  }

  log('info', 'Config', 'Validation passed', {
    API_URL,
    IDLE_SLEEP_MS,
    BATCH_SIZE,
    MAX_CONCURRENT,
    API_SEND_RETRIES,
    URL_SEEN_COOLDOWN_MS,
    REQUEST_DELAY_MIN_MS,
    REQUEST_DELAY_MAX_MS,
    PROXY_ENABLED: !!PROXY_SERVER,
  });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const randomDelay = (minMs, maxMs) => Math.floor(minMs + Math.random() * (maxMs - minMs));

async function ensureLocalQueueFile() {
  try {
    await fs.access(resultsQueuePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(resultsQueuePath, '');
      log('info', 'Queue', 'Initialized local retry queue file', {
        queueFile: resultsQueuePath,
      });
      return;
    }
    throw error;
  }
}

function getBackoffDelay(attempt, baseMs) {
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.floor(baseMs * Math.pow(2, attempt) * jitter);
}

function shouldSkipRecentlyProcessed(url) {
  const lastSeen = processedUrlTimestamps.get(url);
  if (!lastSeen) return false;

  return Date.now() - lastSeen < URL_SEEN_COOLDOWN_MS;
}

function markUrlProcessed(url) {
  const now = Date.now();
  processedUrlTimestamps.set(url, now);

  // Prevent unbounded growth on long-running workers.
  if (processedUrlTimestamps.size > 5000) {
    for (const [seenUrl, ts] of processedUrlTimestamps) {
      if (now - ts > URL_SEEN_COOLDOWN_MS * 2) {
        processedUrlTimestamps.delete(seenUrl);
      }
    }
  }
}

function isInAntiBotCooldown(url) {
  const blockedUntil = blockedUrlCooldown.get(url);
  if (!blockedUntil) return false;

  if (Date.now() >= blockedUntil) {
    blockedUrlCooldown.delete(url);
    return false;
  }

  return true;
}

function markAntiBotBlocked(url) {
  blockedUrlCooldown.set(url, Date.now() + ANTI_BOT_COOLDOWN_MS);
}

/**
 * Categorize errors for better debugging
 */
function categorizeError(error) {
  if (error.code === 'ETIMEDOUT') return 'timeout';
  if (error.message.includes('block')) return 'anti_bot';
  if (error.response?.status >= 500) return 'api_error';
  if (error.message.includes('parse')) return 'parse_error';
  return 'network_error';
}

/**
 * Track and report metrics periodically
 */
function reportMetrics() {
  setInterval(() => {
    const uptime = process.uptime();
    const memory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const totalProcessed = metrics.processed;
    const successRate = totalProcessed > 0
      ? Number(((metrics.successful / totalProcessed) * 100).toFixed(1))
      : 0;
    const topErrorTypes = Object.entries(metrics.errors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([errorType, count]) => ({ errorType, count }));
    const playwrightUsagePercent = totalProcessed > 0
      ? Number(((metrics.playwrightUsed / totalProcessed) * 100).toFixed(1))
      : 0;

    log('info', 'Metrics', 'Scraper status', {
      uptime: `${Math.floor(uptime / 60)}m`,
      memoryMb: memory,
      processed: metrics.processed,
      successful: metrics.successful,
      failed: metrics.failed,
      axiosSuccess: metrics.axiosSuccess,
      playwrightUsed: metrics.playwrightUsed,
      avgFetchMs:
        metrics.processed > 0
          ? Math.round(metrics.totalFetchTime / metrics.processed)
          : 0,
      errorTypes: metrics.errors,
      windowSummary: {
        axiosSuccess: metricsWindow.axiosSuccess,
        playwrightUsed: metricsWindow.playwrightUsed,
        failures: metricsWindow.failures,
      },
    });

    log('info', 'Metrics', 'Periodic summary', {
      totalProcessed,
      successRate,
      topErrorTypes,
      playwrightUsagePercent,
    });

    metricsWindow = {
      axiosSuccess: 0,
      playwrightUsed: 0,
      failures: 0,
    };
  }, 300000); // Every 5 minutes
}

/**
 * Health check: ensure browser is alive
 */
async function healthCheckBrowser() {
  const now = Date.now();

  if (now - lastBrowserCheck < 30000) {
    return; // Check at most every 30 seconds
  }

  lastBrowserCheck = now;

  if (!browserManager.isConnected()) {
    log('error', 'Browser', 'Browser disconnected, restarting...', {});

    try {
      await browserManager.shutdown();
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before restart
      await browserManager.initialize(proxyConfig);
      log('info', 'Browser', 'Browser restarted successfully', {});
    } catch (error) {
      log('error', 'Browser', 'Failed to restart browser', {
        error: error.message,
      });
      throw error;
    }
  }
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanTitle(value) {
  const title = normalizeWhitespace(value)
    .replace(/\s*[\-|\u2013\u2014]\s*(IEEE|Institute of Electrical and Electronics Engineers).*$/i, '')
    .replace(/\s*\|\s*Home\s*$/i, '')
    .trim();
  return title;
}

/**
 * Lightweight HTML extraction used by worker mode.
 * This avoids placeholder rows when the full AI extractor is not wired in this path.
 */
async function processHTML(html, url) {
  log('info', 'Processing', 'Analyzing HTML', { url });

  const $ = cheerio.load(String(html || ''));
  $('script, style, noscript, nav, footer, header').remove();

  const pageTitle = cleanTitle($('title').first().text());
  const h1Title = cleanTitle($('h1').first().text());
  const fallbackTitle = (() => {
    try {
      const parsed = new URL(url);
      return cleanTitle(parsed.hostname.replace(/^www\./i, ''));
    } catch {
      return 'Untitled Opportunity';
    }
  })();

  const title = pageTitle || h1Title || fallbackTitle;

  const description = normalizeWhitespace($('body').text()).slice(0, 2000);
  if (!description || description.length < 40) {
    throw new Error('parse_error: insufficient readable content extracted');
  }

  return {
    title,
    description,
    opportunity: {
      url,
      title,
      description,
      deadline: null,
      cost: 'unspecified',
    },
  };
}

/**
 * Queue result to local file if API fails
 */
async function queueResultLocally(result) {
  try {
    await ensureLocalQueueFile();
    const line = JSON.stringify(result) + '\n';
    await fs.appendFile(resultsQueuePath, line);
    log('warn', 'Queue', 'Retry queued (non-durable)', {
      url: result.opportunity.url,
      queueFile: resultsQueuePath,
      note: 'Local filesystem may be lost on Railway restart',
    });
  } catch (error) {
    log('error', 'Queue', 'Failed to queue result', {
      url: result.opportunity.url,
      error: error.message,
    });
  }
}

/**
 * Send result to backend API with fallback to local queue
 */
async function sendResultToAPI(result, options = {}) {
  const { queueOnFail = true } = options;

  for (let attempt = 0; attempt <= API_SEND_RETRIES; attempt++) {
    try {
      const response = await axios.post(`${API_URL}/api/admin/scrape-result`, result, {
        headers: {
          Authorization: `Bearer ${API_SECRET}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      log('info', 'API', 'Result sent', {
        url: result.opportunity.url,
        status: response.status,
        attempt: attempt + 1,
      });

      return true;
    } catch (error) {
      const isLastAttempt = attempt === API_SEND_RETRIES;
      const errorCode = error.response?.status || error.message;

      log(isLastAttempt ? 'warn' : 'info', 'API', 'Send failed', {
        url: result.opportunity.url,
        error: errorCode,
        attempt: attempt + 1,
        maxAttempts: API_SEND_RETRIES + 1,
      });

      if (!isLastAttempt) {
        const backoff = getBackoffDelay(attempt, API_SEND_BACKOFF_BASE_MS);
        await sleep(backoff);
      }
    }
  }

  if (queueOnFail) {
    await queueResultLocally(result);
  }

  return false;
}

async function reportScrapeFailure(payload) {
  try {
    await axios.post(`${API_URL}/api/admin/scrape-failure`, payload, {
      headers: {
        Authorization: `Bearer ${API_SECRET}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  } catch (error) {
    log('warn', 'API', 'Failed to report scrape failure', {
      url: payload?.sourceUrl || payload?.url || 'n/a',
      error: error.response?.status || error.message,
    });
  }
}

/**
 * Flush local queue periodically
 */
async function flushLocalQueue() {
  setInterval(async () => {
    try {
      await ensureLocalQueueFile();
      const data = await fs.readFile(resultsQueuePath, 'utf-8');
      const lines = data.split('\n').filter(Boolean);

      if (lines.length === 0) return;

      log('info', 'Queue', 'Flushing local queue', { count: lines.length });

      let flushed = 0;
      for (const line of lines) {
        try {
          const result = JSON.parse(line);
          const success = await sendResultToAPI(result, { queueOnFail: false });
          if (success) flushed++;
        } catch (error) {
          log('error', 'Queue', 'Failed to parse queued result', { error: error.message });
        }
      }

      if (flushed === lines.length) {
        await ensureLocalQueueFile();
        await fs.writeFile(resultsQueuePath, '');
        log('info', 'Queue', 'Queue flushed successfully', { count: flushed });
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        await ensureLocalQueueFile();
        return;
      }
      log('error', 'Queue', 'Queue flush failed', { error: error.message });
    }
  }, 60000); // Every minute
}

/**
 * Process a single URL with deduplication
 */
async function processURL(item) {
  const url = typeof item === 'string' ? item : String(item?.url || '').trim();
  const organizationId = typeof item === 'object' ? item.organizationId : null;
  const organizationName = typeof item === 'object' ? item.organizationName : null;

  if (!url) {
    return {
      url: '',
      success: false,
      error: 'invalid_queue_item',
      fetchTime: 0,
    };
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (BLOCKED_DOMAINS.has(hostname)) {
      log('warn', 'Scraper', 'Skipped due to blocked-domain policy', { url, hostname });
      return {
        url,
        success: false,
        error: 'domain_blocked',
        fetchTime: 0,
      };
    }
  } catch {
    // URL parsing handled by downstream validation/fetch errors
  }

  // Check for duplicates
  if (shouldSkipRecentlyProcessed(url)) {
    log('info', 'Scraper', 'Skipping recently processed URL', {
      url,
      cooldownMs: URL_SEEN_COOLDOWN_MS,
    });
    return {
      url,
      success: false,
      error: 'recently_processed',
      fetchTime: 0,
    };
  }

  if (isInAntiBotCooldown(url)) {
    log('warn', 'Scraper', 'Skipped due to anti-bot cooldown', {
      url,
      cooldownMs: ANTI_BOT_COOLDOWN_MS,
    });
    return {
      url,
      success: false,
      error: 'anti_bot_cooldown',
      fetchTime: 0,
    };
  }

  const startTime = Date.now();
  metrics.processed++;

  try {
    log('info', 'Scraper', 'Processing URL', { url, organizationId, organizationName });

    // Fetch page with hybrid logic
    const fetchAttempt = fetchPage(url, {
      proxyConfig,
      maxRetries: 1,
    });

    const timeoutAttempt = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Hard fetch timeout after ${FETCH_HARD_TIMEOUT_MS}ms`)), FETCH_HARD_TIMEOUT_MS);
    });

    const { html, methodUsed } = await Promise.race([fetchAttempt, timeoutAttempt]);

    // Process HTML through pipeline
    const result = await processHTML(html, url);
    result.sourceUrl = url;
    result.methodUsed = methodUsed;
    result.scrapedAt = new Date().toISOString();
    result.fetchTimeMs = Date.now() - startTime;
    if (organizationId) {
      result.organizationId = organizationId;
      result.opportunity = {
        ...result.opportunity,
        organizationId,
      };
    }

    // Send to API
    const success = await sendResultToAPI(result);

    const fetchTime = Date.now() - startTime;
    if (success) {
      metrics.successful++;
    } else {
      metrics.failed++;
      metricsWindow.failures++;
    }

    if (methodUsed === 'axios') {
      metrics.axiosSuccess++;
      metricsWindow.axiosSuccess++;
    }

    if (methodUsed === 'playwright') {
      metrics.playwrightUsed++;
      metricsWindow.playwrightUsed++;
    }

    metrics.totalFetchTime += fetchTime;
    markUrlProcessed(url);

    log('info', 'Scraper', 'Scrape summary', {
      url,
      organizationId,
      methodUsed,
      itemsFound: Array.isArray(result?.opportunities) ? result.opportunities.length : 1,
      delivered: success,
      fetchTime,
    });

    return {
      url,
      success,
      fetchTime,
      error: null,
    };
  } catch (error) {
    const fetchTime = Date.now() - startTime;
    const errorType = categorizeError(error);

    if (errorType === 'anti_bot') {
      markAntiBotBlocked(url);
      log('warn', 'Scraper', 'Skipped due to anti-bot', {
        url,
        nextRetryInMs: ANTI_BOT_COOLDOWN_MS,
      });
    }

    metrics.failed++;
    metricsWindow.failures++;
    metrics.totalFetchTime += fetchTime;
    metrics.errors[errorType] = (metrics.errors[errorType] || 0) + 1;

    await reportScrapeFailure({
      sourceUrl: url,
      organizationId,
      errorType,
      errorMessage: error.message,
      methodUsed: 'unknown',
      fetchTimeMs: fetchTime,
    });

    log('error', 'Scraper', 'Failed to process URL', {
      url,
      error: error.message,
      errorType,
      fetchTime,
    });

    return {
      url,
      success: false,
      error: error.message,
      fetchTime,
    };
  }
}

/**
 * Process batch with rate limiting
 */
async function processBatch(urls) {
  log('info', 'Batch', 'Starting batch', { count: urls.length });

  const results = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    // Rate limiting: 2-5 second delay between requests
    if (i > 0) {
      const delay = 2000 + Math.random() * 3000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Check browser health before each request
    await healthCheckBrowser();

    const result = await processURL(url);
    results.push(result);
  }

  log('info', 'Batch', 'Batch complete', {
    count: urls.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  });

  return results;
}

/**
 * Fetch URL queue from backend
 */
async function fetchURLQueue() {
  try {
    log('info', 'Queue', 'Fetching URL queue from API', { endpoint: '/api/admin/scrape-queue' });

    const response = await axios.get(`${API_URL}/api/admin/scrape-queue`, {
      headers: { Authorization: `Bearer ${API_SECRET}` },
      timeout: 10000,
    });

    const items = Array.isArray(response.data?.items)
      ? response.data.items
      : (response.data?.urls || []).map(url => ({ url }));

    log('info', 'Queue', 'Fetched queue items', { count: items.length });
    return items;
  } catch (error) {
    log('error', 'Queue', 'Failed to fetch URL queue', { error: error.message });
    return [];
  }
}

/**
 * Main job loop
 */
async function runJob() {
  const jobStart = new Date().toISOString();
  log('info', 'Job', 'Job started', { timestamp: jobStart });

  try {
    // Fetch URLs to process
    const urls = await fetchURLQueue();

    if (!urls || urls.length === 0) {
      log('info', 'Job', 'No URLs in queue', {});
      return;
    }

    log('info', 'Job', `Processing ${urls.length} URLs`, { batchSize: BATCH_SIZE });

    // Process in batches
    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);
      await processBatch(batch);

      // Delay between batches
      if (i + BATCH_SIZE < urls.length) {
        const delay = 5000 + Math.random() * 5000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    log('info', 'Job', 'Job completed', { timestamp: new Date().toISOString() });
  } catch (error) {
    log('error', 'Job', 'Job failed', { error: error.message });
  }
}

/**
 * Free-tier optimized worker loop:
 * - only works when queue has items
 * - sleeps when queue is empty
 * - keeps concurrency bounded to avoid memory spikes
 */
async function workerLoop() {
  while (!isShuttingDown) {
    try {
      await healthCheckBrowser();

      const urls = await fetchURLQueue();
      if (!urls || urls.length === 0) {
        log('info', 'Worker', 'No jobs. Sleeping...', { sleepMs: IDLE_SLEEP_MS });
        await sleep(IDLE_SLEEP_MS);
        continue;
      }

      log('info', 'Worker', 'Processing queue', {
        urlCount: urls.length,
        batchSize: BATCH_SIZE,
        maxConcurrent: MAX_CONCURRENT,
      });

      for (let i = 0; i < urls.length && !isShuttingDown; i += BATCH_SIZE) {
        const batch = urls.slice(i, i + BATCH_SIZE);

        for (let j = 0; j < batch.length && !isShuttingDown; j += MAX_CONCURRENT) {
          const chunk = batch.slice(j, j + MAX_CONCURRENT);
          await Promise.all(chunk.map(url => processURL(url)));

          if (j + MAX_CONCURRENT < batch.length) {
            await sleep(randomDelay(REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS));
          }
        }

        if (i + BATCH_SIZE < urls.length) {
          await sleep(randomDelay(REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS));
        }
      }
    } catch (error) {
      log('error', 'Worker', 'Loop error', { error: error.message });
      await sleep(IDLE_SLEEP_MS);
    }
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(signal) {
  log('info', 'Shutdown', 'Graceful shutdown initiated', { signal });
  isShuttingDown = true;

  try {
    await browserManager.shutdown();
    log('info', 'Shutdown', 'Browser closed', {});

    // Attempt to flush queue before exit
    const data = await fs.readFile(resultsQueuePath, 'utf-8');
    if (data.trim()) {
      log('info', 'Shutdown', 'Queue has pending items, they will be retried on next start', {
        items: data.split('\n').filter(Boolean).length,
      });
    }

    log('info', 'Shutdown', 'Shutdown complete', { signal });
    process.exit(0);
  } catch (error) {
    log('error', 'Shutdown', 'Error during shutdown', { error: error.message });
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main() {
  log('info', 'Scraper', 'Starting Web Scraper Worker', {
    version: '1.0.0-enhanced',
  });

  log('warn', 'Queue', 'Local queue storage is best-effort on ephemeral filesystems', {
    queueFile: resultsQueuePath,
    note: 'On Railway restarts, queued results may be lost. Use DB-backed queue for durable retries.',
  });

  // Validate config first
  validateConfig();

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  try {
    await ensureLocalQueueFile();

    // Initialize browser
    log('info', 'Scraper', 'Initializing browser...', {});
    await browserManager.initialize(proxyConfig);

    // Start metrics reporting
    reportMetrics();

    // Start queue flushing
    flushLocalQueue();

    // Run first job immediately
    await workerLoop();
  } catch (error) {
    log('error', 'Scraper', 'Fatal initialization error', { error: error.message });
    await browserManager.shutdown();
    process.exit(1);
  }
}

// Start if run directly
if (require.main === module) {
  main().catch(error => {
    log('error', 'Scraper', 'Unhandled error', { error: error.message });
    process.exit(1);
  });
}

module.exports = {
  processURL,
  processBatch,
  fetchURLQueue,
  runJob,
  workerLoop,
};
