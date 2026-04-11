/**
 * Hybrid Fetch Layer
 * Tries Axios first for speed, falls back to Playwright for blocked requests
 * Detects anti-bot pages and triggers fallback automatically
 */

const axios = require('axios');
const https = require('https');
const browserManager = require('./browserManager');

const PAGE_TIMEOUT_MS = Math.max(5000, parseInt(process.env.PAGE_TIMEOUT_MS || '30000', 10));
const PLAYWRIGHT_DELAY_MIN_MS = Math.max(500, parseInt(process.env.REQUEST_DELAY_MIN_MS || '1500', 10));
const PLAYWRIGHT_DELAY_MAX_MS = Math.max(PLAYWRIGHT_DELAY_MIN_MS + 250, parseInt(process.env.REQUEST_DELAY_MAX_MS || '4000', 10));
const AXIOS_INSECURE_SSL = String(process.env.AXIOS_INSECURE_SSL || 'false').toLowerCase() === 'true';
const axiosHttpsAgent = AXIOS_INSECURE_SSL
  ? new https.Agent({ rejectUnauthorized: false })
  : undefined;

// Anti-bot detection patterns
const BLOCK_PATTERNS = [
  /access\s+denied/i,
  /checking\s+your\s+browser/i,
  /captcha/i,
  /cloudflare/i,
  /please\s+wait\s+while\s+we\s+check\s+your\s+browser/i,
  /browser\s+is\s+being\s+checked/i,
  /security\s+check/i,
  /please\s+try\s+again\s+later/i,
  /503\s+service\s+unavailable/i,
  /rate\s+limit/i,
];

/**
 * Detect if response is a block page
 */
function isBlockPage(html) {
  if (!html) return false;

  // Some sites return tiny interstitial/challenge pages with HTTP 200.
  const normalized = String(html).trim();
  const looksLikeHtml = /<\s*!doctype|<\s*html|<\s*head|<\s*body/i.test(normalized);
  const suspiciouslySmallHtml = looksLikeHtml && normalized.length > 0 && normalized.length < 500;

  return suspiciouslySmallHtml || BLOCK_PATTERNS.some(pattern => pattern.test(normalized));
}

function isBrowserClosedError(error) {
  const message = String(error?.message || '');
  return (
    message.includes('Target page, context or browser has been closed') ||
    message.includes('Browser has been closed') ||
    message.includes('browser.newPage')
  );
}

function isAntiBotError(error) {
  const message = String(error?.message || '');
  return (
    message.includes('Block page detected') ||
    message.includes('anti-bot') ||
    message.includes('captch') ||
    message.includes('403') ||
    message.includes('429')
  );
}

/**
 * Axes fetch with standard headers
 */
async function fetchWithAxios(url) {
  const axiosInstance = axios.create({
    timeout: 15000,
    maxRedirects: 5,
  });

  const response = await axiosInstance.get(url, {
    httpsAgent: axiosHttpsAgent,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      DNT: '1',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  return response.data;
}

/**
 * Playwright fetch with anti-bot evasion
 */
async function fetchWithPlaywright(url, proxyConfig = {}) {
  let page = null;

  try {
    console.log(`[Playwright] Fetching: ${url}`);

    page = await browserManager.createPage();

    // Navigate to page
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS,
    });

    // Random delay to avoid detection and reduce bot-like behavior.
    const delay = PLAYWRIGHT_DELAY_MIN_MS + Math.random() * (PLAYWRIGHT_DELAY_MAX_MS - PLAYWRIGHT_DELAY_MIN_MS);
    await page.waitForTimeout(delay);

    // Extract HTML
    const html = await page.content();

    // Some anti-bot systems still return interstitial pages to browsers.
    if (isBlockPage(html)) {
      throw new Error('Block page detected after Playwright render');
    }

    return html;
  } catch (error) {
    if (isBrowserClosedError(error)) {
      throw new Error(`Playwright browser closed: ${error.message}`);
    }

    if (isAntiBotError(error)) {
      throw new Error(`Playwright fetch blocked: ${error.message}`);
    }
    throw new Error(`Playwright fetch failed: ${error.message}`);
  } finally {
    if (page) {
      await browserManager.closePage(page);
    }
  }
}

/**
 * Main hybrid fetch function
 * Tries Axios first, fallback to Playwright on 403/429 or detected blocks
 *
 * @param {string} url - URL to fetch
 * @param {Object} options - { proxyConfig, retryCount }
 * @returns {Promise<{html: string, methodUsed: 'axios' | 'playwright'}>} HTML content + method used
 */
async function fetchPage(url, options = {}) {
  const { proxyConfig = {}, maxRetries = 1 } = options;

  let lastError = null;

  const withFetchPrefix = (err, extra = {}) => {
    const message = String(err?.message || 'Unknown fetch error');
    const wrapped = message.startsWith(`Failed to fetch ${url}`)
      ? new Error(message)
      : new Error(`Failed to fetch ${url}: ${message}`);
    Object.assign(wrapped, err, extra);
    return wrapped;
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[fetchPage] Attempt ${attempt + 1} for ${url}`);

      // Try Axios first
      try {
        console.log(`[fetchPage] Trying Axios...`);
        const html = await fetchWithAxios(url);

        // Check if we got a block page
        if (isBlockPage(html)) {
          console.log(`[fetchPage] Detected block page, falling back to Playwright`);
          throw new Error('Block page detected');
        }

        console.log(`[fetchPage] ✓ Success with Axios`);
        return { html, methodUsed: 'axios' };
      } catch (axiosError) {
        // Check for specific status codes that indicate blocking
        if (axiosError.response) {
          const status = axiosError.response.status;

          if ([403, 429, 401, 503].includes(status)) {
            console.log(`[fetchPage] HTTP ${status} - falling back to Playwright`);
          } else {
            // Also check if response body is a block page
            const html = axiosError.response.data;
            if (typeof html === 'string' && isBlockPage(html)) {
              console.log(`[fetchPage] Block page in response, falling back to Playwright`);
            } else {
              // Non-blocking HTTP error: surface it to caller.
              throw axiosError;
            }
          }
        } else {
          // Network error or timeout, try Playwright
          console.log(`[fetchPage] Axios failed (${axiosError.message}), trying Playwright`);
        }

        // If we reached here, fallback to Playwright for this attempt.
      }

      // Fallback to Playwright
      try {
        const html = await fetchWithPlaywright(url, proxyConfig);
        console.log(`[fetchPage] ✓ Success with Playwright`);
        return { html, methodUsed: 'playwright' };
      } catch (playwrightError) {
        console.error(`[fetchPage] Playwright also failed: ${playwrightError.message}`);
        lastError = playwrightError;
        playwrightError.fetchMethod = 'playwright';
        playwrightError.fallbackMethod = 'playwright';
        playwrightError.attemptedPlaywright = true;

        if (isBrowserClosedError(playwrightError)) {
          console.log('[fetchPage] Browser closed detected, restarting browser manager...');
          try {
            await browserManager.restart(proxyConfig);
          } catch (restartError) {
            console.error(`[fetchPage] Browser restart failed: ${restartError.message}`);
          }
        }

        if (isAntiBotError(playwrightError)) {
          throw withFetchPrefix(playwrightError, {
            fetchMethod: 'playwright',
            fallbackMethod: 'playwright',
            attemptedPlaywright: true,
          });
        }

        // If this was the last attempt, throw
        if (attempt === maxRetries) {
          throw playwrightError;
        }

        // Otherwise, wait before retry
        const retryDelay = 2000 + Math.random() * 3000;
        console.log(`[fetchPage] Retrying in ${retryDelay.toFixed(0)}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    } catch (error) {
      lastError = error;

      if (isAntiBotError(error)) {
        throw withFetchPrefix(error, error.attemptedPlaywright ? { attemptedPlaywright: true } : {});
      }

      if (attempt === maxRetries) {
        throw new Error(`Failed to fetch ${url} after ${maxRetries + 1} attempts: ${error.message}`);
      }

      // Retry with backoff
      const retryDelay = 2000 + Math.random() * 3000;
      console.log(`[fetchPage] Retry ${attempt + 1}/${maxRetries} in ${retryDelay.toFixed(0)}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  throw lastError || new Error(`Failed to fetch ${url}`);
}

module.exports = { fetchPage, isBlockPage };
