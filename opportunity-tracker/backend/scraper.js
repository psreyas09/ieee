/**
 * Production Web Scraper Worker
 * Orchestrates URL fetching, HTML extraction, and result delivery to backend API
 * Designed for Railway deployment with continuous job loop
 */

require('dotenv').config();
const axios = require('axios');
const browserManager = require('./browserManager');
const { fetchPage } = require('./fetchPage');

// Configuration from environment
const API_URL = process.env.API_URL || 'http://localhost:3000';
const API_SECRET = process.env.API_SECRET || '';
const PROXY_SERVER = process.env.PROXY_SERVER || null;
const PROXY_USERNAME = process.env.PROXY_USERNAME || null;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || null;
const IDLE_SLEEP_MS = parseInt(process.env.IDLE_SLEEP_MS || '60000', 10); // 1 minute when queue is empty
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const MAX_CONCURRENT = Math.max(1, Math.min(parseInt(process.env.MAX_CONCURRENT || '1', 10), 2));

let isShuttingDown = false;

// Proxy configuration
const proxyConfig =
  PROXY_SERVER && PROXY_SERVER.trim()
    ? {
        server: PROXY_SERVER,
        username: PROXY_USERNAME,
        password: PROXY_PASSWORD,
      }
    : {};

/**
 * Mock function to process HTML (replace with actual Cheerio + Gemini pipeline)
 * In production, this would:
 * 1. Parse HTML with Cheerio
 * 2. Extract relevant data
 * 3. Send to Gemini for structured output
 */
async function processHTML(html, url) {
  console.log(`[Scraper] Processing HTML for: ${url}`);

  // Mock processing - replace with real pipeline
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

/**
 * Send scraped result to backend API
 */
async function sendResultToAPI(result) {
  try {
    console.log(`[API] Sending result for: ${result.opportunity.url}`);

    const response = await axios.post(`${API_URL}/api/admin/scrape-result`, result, {
      headers: {
        Authorization: `Bearer ${API_SECRET}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    console.log(`[API] ✓ Result accepted: ${response.status}`);
    return true;
  } catch (error) {
    console.error(`[API] Failed to send result:`, {
      url: result.opportunity.url,
      error: error.response?.status || error.message,
    });
    return false;
  }
}

/**
 * Process a single URL: fetch, extract, send to API
 */
async function processURL(url) {
  const startTime = Date.now();

  try {
    console.log(`\n[Scraper] Starting: ${url}`);

    // Fetch page with hybrid logic
    const { html, methodUsed } = await fetchPage(url, {
      proxyConfig,
      maxRetries: 1,
    });

    const fetchTime = Date.now() - startTime;
    console.log(`[Scraper] Fetched in ${fetchTime}ms`);

    // Process HTML through pipeline
    const result = await processHTML(html, url);

    // Send to backend API
    const success = await sendResultToAPI(result);

    console.log('[Scraper] Scrape summary:', {
      url,
      methodUsed,
      itemsFound: Array.isArray(result?.opportunities) ? result.opportunities.length : 1,
      delivered: success,
    });

    return {
      url,
      success,
      fetchTime,
      error: null,
    };
  } catch (error) {
    console.error(`[Scraper] Failed to process ${url}:`, error.message);

    return {
      url,
      success: false,
      error: error.message,
      fetchTime: Date.now() - startTime,
    };
  }
}

/**
 * Process batch of URLs sequentially with rate limiting
 */
async function processBatch(urls) {
  console.log(`\n[Scraper] Processing batch of ${urls.length} URLs`);

  const results = [];
  const stats = {
    total: urls.length,
    success: 0,
    failed: 0,
    totalTime: 0,
  };

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    // Random delay between requests (2-5 seconds)
    if (i > 0) {
      const delay = 2000 + Math.random() * 3000;
      console.log(`[Scraper] Waiting ${delay.toFixed(0)}ms before next request...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const result = await processURL(url);
    results.push(result);

    if (result.success) {
      stats.success++;
    } else {
      stats.failed++;
    }

    stats.totalTime += result.fetchTime;
  }

  console.log(`\n[Scraper] Batch complete:`, {
    success: stats.success,
    failed: stats.failed,
    totalTime: `${stats.totalTime}ms`,
    avgTime: `${(stats.totalTime / stats.total).toFixed(0)}ms`,
  });

  return results;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const randomDelay = (minMs, maxMs) => Math.floor(minMs + Math.random() * (maxMs - minMs));

/**
 * Fetch list of URLs from backend API to scrape
 * (In production, this would retrieve a queue of pending URLs)
 */
async function fetchURLQueue() {
  try {
    console.log('[Scraper] Fetching URL queue from API...');

    // Mock implementation - replace with actual API call
    // const response = await axios.get(`${API_URL}/api/admin/scrape-queue`, {
    //   headers: { Authorization: `Bearer ${API_SECRET}` },
    // });
    // return response.data.urls || [];

    // For demo, return empty to avoid actual scraping
    return [];
  } catch (error) {
    console.error('[Scraper] Failed to fetch URL queue:', error.message);
    return [];
  }
}

/**
 * Main job loop - runs on interval
 */
async function runJob() {
  const startTime = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Job] Started at ${startTime}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Fetch URLs to process
    const urls = await fetchURLQueue();

    if (!urls || urls.length === 0) {
      console.log('[Job] No URLs in queue. Idle until next interval.');
      return;
    }

    console.log(`[Job] Processing ${urls.length} URLs in batches of ${BATCH_SIZE}`);

    // Process in batches
    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);
      await processBatch(batch);

      // Delay between batches
      if (i + BATCH_SIZE < urls.length) {
        const delay = 5000 + Math.random() * 5000;
        console.log(`[Job] Waiting ${delay.toFixed(0)}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } catch (error) {
    console.error('[Job] Fatal error:', error.message);
  } finally {
    const endTime = new Date().toISOString();
    console.log(`[Job] Completed at ${endTime}`);
    console.log(`${'='.repeat(60)}\n`);
  }
}

/**
 * Free-tier friendly loop:
 * - polls queue continuously
 * - sleeps when empty
 * - processes with bounded concurrency
 */
async function workerLoop() {
  while (!isShuttingDown) {
    try {
      const urls = await fetchURLQueue();

      if (!urls || urls.length === 0) {
        console.log(`[Worker] No jobs. Sleeping ${IDLE_SLEEP_MS}ms...`);
        await sleep(IDLE_SLEEP_MS);
        continue;
      }

      console.log(`[Worker] Found ${urls.length} URLs. Processing with concurrency ${MAX_CONCURRENT}`);

      for (let i = 0; i < urls.length && !isShuttingDown; i += BATCH_SIZE) {
        const batch = urls.slice(i, i + BATCH_SIZE);

        for (let j = 0; j < batch.length && !isShuttingDown; j += MAX_CONCURRENT) {
          const chunk = batch.slice(j, j + MAX_CONCURRENT);
          await Promise.all(chunk.map(url => processURL(url)));

          if (j + MAX_CONCURRENT < batch.length) {
            await sleep(randomDelay(2000, 4000));
          }
        }

        if (i + BATCH_SIZE < urls.length) {
          await sleep(randomDelay(3000, 6000));
        }
      }
    } catch (error) {
      console.error('[Worker] Loop error:', error.message);
      await sleep(IDLE_SLEEP_MS);
    }
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal) {
  console.log(`\n[Scraper] Received ${signal}, shutting down gracefully...`);
  isShuttingDown = true;

  try {
    await browserManager.shutdown();
    console.log('[Scraper] Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[Scraper] Error during shutdown:', error.message);
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log('[Scraper] Web Scraper Worker Starting');
  console.log('[Config]', {
    API_URL,
    IDLE_SLEEP_MS: `${IDLE_SLEEP_MS}ms`,
    BATCH_SIZE,
    MAX_CONCURRENT,
    PROXY_ENABLED: !!PROXY_SERVER,
  });

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  try {
    // Initialize browser
    await browserManager.initialize(proxyConfig);

    // Start queue-aware worker loop (no fixed interval spam)
    await workerLoop();
  } catch (error) {
    console.error('[Scraper] Fatal initialization error:', error.message);
    await browserManager.shutdown();
    process.exit(1);
  }
}

// Start if run directly
if (require.main === module) {
  main().catch(error => {
    console.error('[Scraper] Unhandled error:', error);
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
