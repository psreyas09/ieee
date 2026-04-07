require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenAI } = require('@google/genai');
const https = require('https');

function getGeminiApiKeys() {
    const csvKeys = (process.env.GEMINI_API_KEYS || '')
        .split(',')
        .map(key => key.trim())
        .filter(Boolean);

    const namedKeys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2]
        .map(key => (key || '').trim())
        .filter(Boolean);

    return [...new Set([...csvKeys, ...namedKeys])];
}

const geminiApiKeys = getGeminiApiKeys();
const geminiClients = geminiApiKeys.map(apiKey => new GoogleGenAI({ apiKey }));
let nextGeminiClientIndex = 0;

const GEMINI_PRIMARY_MODEL = process.env.GEMINI_PRIMARY_MODEL || 'gemini-3.1-flash-lite-preview';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3-flash-preview';

const SAFE_CRAWL_MAX_PAGES = Number(process.env.SCRAPER_MAX_PAGES || 8);
const SAFE_CRAWL_MAX_DEPTH = Number(process.env.SCRAPER_MAX_DEPTH || 1);
const SAFE_CRAWL_MAX_LINKS_PER_PAGE = Number(process.env.SCRAPER_MAX_LINKS_PER_PAGE || 10);
const SAFE_CRAWL_MAX_TEXT_PER_PAGE = Number(process.env.SCRAPER_MAX_TEXT_PER_PAGE || 3000);
const SAFE_CRAWL_TOTAL_TEXT_CAP = Number(process.env.SCRAPER_TOTAL_TEXT_CAP || 12000);

const SKIP_FILE_EXTENSIONS = new Set([
    '.pdf', '.zip', '.rar', '.7z', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.mp3', '.avi', '.mov'
]);

const HIGH_SIGNAL_KEYWORDS = [
    'opportun', 'award', 'grant', 'scholarship', 'fellowship', 'competition', 'contest',
    'paper', 'call-for-papers', 'cfp', 'hackathon', 'students', 'student', 'events', 'conference'
];

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function parseOrganizationScrapeUrls(organization) {
    const fromArray = Array.isArray(organization.scrapeUrls)
        ? organization.scrapeUrls
        : [];

    const fromField = typeof organization.scrapeUrl === 'string'
        ? organization.scrapeUrl.split(/\r?\n|,/)
        : [];

    const combined = [...fromArray, ...fromField]
        .map(url => String(url).trim())
        .filter(Boolean);

    return [...new Set(combined)];
}

function getGeminiClientOrder() {
    if (geminiClients.length <= 1) {
        return geminiClients.map((client, index) => ({ client, keyNumber: index + 1 }));
    }

    const startIndex = nextGeminiClientIndex % geminiClients.length;
    nextGeminiClientIndex = (nextGeminiClientIndex + 1) % geminiClients.length;

    return geminiClients.map((_, offset) => {
        const clientIndex = (startIndex + offset) % geminiClients.length;
        return { client: geminiClients[clientIndex], keyNumber: clientIndex + 1 };
    });
}

function extractRetryAfterSeconds(message = '') {
    const match = String(message).match(/retryDelay\"\s*:\s*\"(\d+)s\"/i) || String(message).match(/retry in\s+(\d+(?:\.\d+)?)s/i);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? Math.ceil(value) : null;
}

function buildCandidateUrls(urls) {
    const normalized = [...new Set(urls.map(url => String(url).trim()).filter(Boolean))];
    const extraPaths = ['/opportunities', '/events', '/news', '/awards', '/students'];
    const all = [...normalized];

    for (const base of normalized) {
        try {
            const parsed = new URL(base);
            const path = parsed.pathname.replace(/\/+$/, '') || '/';
            if (path !== '/') continue;

            for (const extraPath of extraPaths) {
                all.push(`${parsed.origin}${extraPath}`);
            }
        } catch {
            // Ignore malformed URL; validation happens earlier.
        }
    }

    return [...new Set(all)];
}

function normalizeUrl(value) {
    try {
        const parsed = new URL(String(value).trim());
        parsed.hash = '';
        const cleanedPath = parsed.pathname.replace(/\/+$/, '');
        parsed.pathname = cleanedPath || '/';
        return parsed.toString();
    } catch {
        return null;
    }
}

function hasBlockedExtension(urlString) {
    try {
        const parsed = new URL(urlString);
        const path = parsed.pathname.toLowerCase();
        for (const ext of SKIP_FILE_EXTENSIONS) {
            if (path.endsWith(ext)) return true;
        }
    } catch {
        return true;
    }
    return false;
}

function isSameDomainUrl(baseUrl, candidateUrl) {
    try {
        const base = new URL(baseUrl);
        const candidate = new URL(candidateUrl);
        return base.hostname === candidate.hostname;
    } catch {
        return false;
    }
}

function scoreLink(urlString) {
    const target = String(urlString).toLowerCase();
    let score = 0;

    for (const token of HIGH_SIGNAL_KEYWORDS) {
        if (target.includes(token)) score += 3;
    }

    if (target.includes('/news')) score += 1;
    if (target.includes('/blog')) score -= 1;
    if (target.includes('/contact')) score -= 2;
    if (target.includes('/about')) score -= 1;
    if (target.includes('/privacy')) score -= 3;

    return score;
}

function extractLowSignalText($, pageUrl) {
    const metaPieces = [
        $('title').text(),
        $('meta[name="description"]').attr('content'),
        $('meta[property="og:title"]').attr('content'),
        $('meta[property="og:description"]').attr('content')
    ].filter(Boolean);

    const headingText = $('h1, h2, h3')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean)
        .slice(0, 40)
        .join(' ');

    const accessibilityText = $('[aria-label], [title], img[alt]')
        .map((_, el) => $(el).attr('aria-label') || $(el).attr('title') || $(el).attr('alt') || '')
        .get()
        .map(value => String(value).trim())
        .filter(Boolean)
        .slice(0, 80)
        .join(' ');

    const linkSlugText = $('a[href]')
        .map((_, el) => $(el).attr('href'))
        .get()
        .map((href) => {
            try {
                const url = new URL(String(href).trim(), pageUrl);
                return url.pathname
                    .split(/[\/_-]+/)
                    .map(token => token.trim())
                    .filter(token => token.length >= 3)
                    .join(' ');
            } catch {
                return '';
            }
        })
        .filter(Boolean)
        .slice(0, 120)
        .join(' ');

    const pageSignal = (() => {
        try {
            const parsed = new URL(pageUrl);
            return `${parsed.hostname} ${parsed.pathname}`;
        } catch {
            return String(pageUrl || '');
        }
    })();

    return [metaPieces.join(' '), headingText, accessibilityText, linkSlugText, pageSignal]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function fetchAndExtractText(url) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            },
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: 10000 // 10 second timeout
        });

        const $ = cheerio.load(data);

        // Remove scripts, styles, and other non-content tags
        $('script, style, nav, footer, header, iframe, noscript').remove();

        // Extract raw text and clean it
        let extractedText = $('body').text().replace(/\s+/g, ' ').trim();

        if (extractedText.length < 120) {
            // JS-heavy sites may expose little body text in static HTML.
            // Use metadata/headers/accessibility/link-slug signals as a secondary source.
            const fallbackText = extractLowSignalText($, url);
            if (fallbackText.length > extractedText.length) {
                extractedText = fallbackText;
            }
        }

        if (extractedText.length < 8) {
            throw new Error('Page returned almost no readable text (likely JS-rendered or blocked). Try a deeper content URL.');
        }

        // Limit to 12000 characters to fit well within Gemini's context window easily
        // while providing enough signal.
        if (extractedText.length > 12000) {
            extractedText = extractedText.substring(0, 12000);
        }

        return extractedText;
    } catch (error) {
        console.error(`Error fetching URL: ${url}`, error.message);
        if (error.response && error.response.status === 403) {
            throw new Error(`The target website blocked our scraper (Error 403). They have anti-bot protection.`);
        }
        if (error.code === 'ECONNABORTED') {
            throw new Error(`The target website took too long to respond (Timeout).`);
        }
        throw new Error(`Failed to fetch URL: ${error.message}`);
    }
}

async function fetchPage(url) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            },
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: 10000
        });
        return String(data || '');
    } catch (error) {
        if (error.response?.status === 403) {
            throw new Error('403_FORBIDDEN');
        }
        if (error.response?.status === 404) {
            throw new Error('404_NOT_FOUND');
        }
        if (error.code === 'ECONNABORTED') {
            throw new Error('TIMEOUT');
        }
        throw new Error(error.message || 'FETCH_FAILED');
    }
}

function extractVisibleTextAndLinks(rawHtml, pageUrl) {
    const $ = cheerio.load(rawHtml);

    $('script, style, nav, footer, header, iframe, noscript').remove();
    let text = $('body').text().replace(/\s+/g, ' ').trim();

    if (text.length < 120) {
        const fallbackText = extractLowSignalText($, pageUrl);
        if (fallbackText.length > text.length) {
            text = fallbackText;
        }
    }

    const links = $('a[href]')
        .map((_, el) => $(el).attr('href'))
        .get()
        .map((href) => {
            try {
                return new URL(String(href).trim(), pageUrl).toString();
            } catch {
                return null;
            }
        })
        .filter(Boolean);

    return { text, links };
}

async function crawlRelevantContent(seedUrls) {
    const normalizedSeeds = [...new Set(
        seedUrls
            .map(normalizeUrl)
            .filter(Boolean)
            .filter(url => !hasBlockedExtension(url))
    )];

    if (normalizedSeeds.length === 0) {
        throw new Error('No valid seed URLs available for crawling.');
    }

    const visited = new Set();
    const queue = normalizedSeeds.map((url) => ({ url, depth: 0, base: url }));
    const textParts = [];
    const crawlErrors = [];
    const blockedBy403 = [];
    let textLength = 0;

    const buildAttemptSummary = (errors) => {
        if (!errors || errors.length === 0) return 'none';
        const maxItems = 8;
        const items = errors.slice(0, maxItems);
        const suffix = errors.length > maxItems ? ` | ... +${errors.length - maxItems} more` : '';
        return `${items.join(' | ')}${suffix}`;
    };

    while (queue.length > 0 && visited.size < SAFE_CRAWL_MAX_PAGES && textLength < SAFE_CRAWL_TOTAL_TEXT_CAP) {
        const current = queue.shift();
        if (!current || visited.has(current.url)) continue;
        visited.add(current.url);

        try {
            const html = await fetchPage(current.url);
            const { text, links } = extractVisibleTextAndLinks(html, current.url);

            if (text && text.length >= 20) {
                const trimmed = text.slice(0, SAFE_CRAWL_MAX_TEXT_PER_PAGE);
                const prefix = `Source: ${current.url}\n`;
                const remaining = SAFE_CRAWL_TOTAL_TEXT_CAP - textLength;
                const chunk = `${prefix}${trimmed}\n\n`;

                if (remaining > 0) {
                    textParts.push(chunk.slice(0, remaining));
                    textLength += Math.min(chunk.length, remaining);
                }
            }

            if (current.depth >= SAFE_CRAWL_MAX_DEPTH) continue;

            const nextLinks = [...new Set(links)]
                .map(normalizeUrl)
                .filter(Boolean)
                .filter(url => !visited.has(url))
                .filter(url => !hasBlockedExtension(url))
                .filter(url => isSameDomainUrl(current.base, url))
                .map((url) => ({ url, score: scoreLink(url) }))
                .sort((a, b) => b.score - a.score)
                .slice(0, SAFE_CRAWL_MAX_LINKS_PER_PAGE)
                .map((row) => row.url);

            for (const nextUrl of nextLinks) {
                if (visited.has(nextUrl)) continue;
                queue.push({ url: nextUrl, depth: current.depth + 1, base: current.base });
            }
        } catch (error) {
            if (error.message === '403_FORBIDDEN') {
                blockedBy403.push(current.url);
            }
            crawlErrors.push(`${current.url} -> ${error.message}`);
            console.warn(`Crawl skip for ${current.url}: ${error.message}`);
        }
    }

    if (textParts.length === 0) {
        if (blockedBy403.length > 0 && blockedBy403.length === visited.size) {
            throw new Error('Target website blocked the scraper on all attempted subsection URLs (403 anti-bot protection). Add a direct public content URL in admin scrape URLs or use manual entry.');
        }

        // Last-resort fallback: some pages expose usable metadata/anchor text on seed URLs,
        // even when bounded subsection crawling yields no readable chunks.
        const fallbackErrors = [];
        for (const seedUrl of normalizedSeeds.slice(0, 3)) {
            try {
                const extracted = await fetchAndExtractText(seedUrl);
                if (extracted && extracted.length >= 20) {
                    return {
                        text: `Source: ${seedUrl}\n${extracted}`.slice(0, SAFE_CRAWL_TOTAL_TEXT_CAP),
                        pagesVisited: visited.size,
                        errors: [...crawlErrors, `fallback-success:${seedUrl}`]
                    };
                }
            } catch (fallbackError) {
                fallbackErrors.push(`${seedUrl} -> ${fallbackError.message}`);
            }
        }

        throw new Error(
            `Failed to extract readable content from seed/subsection crawl. ` +
            `Crawl attempts: ${buildAttemptSummary(crawlErrors)}. ` +
            `Direct-seed fallback attempts: ${buildAttemptSummary(fallbackErrors)}. ` +
            `Add a direct public opportunity/events URL in admin scrape URLs or use manual entry for this source.`
        );
    }

    return {
        text: textParts.join(' ').slice(0, SAFE_CRAWL_TOTAL_TEXT_CAP),
        pagesVisited: visited.size,
        errors: crawlErrors
    };
}

async function analyzeWithGemini(text) {
    const prompt = `From the following webpage text, extract all student competitions, paper contests, grants, hackathons, fellowships, workshops or any opportunities relevant to IEEE student members. Return ONLY a valid JSON array with no extra text, no preamble, no markdown. Each object must have: title (string), description (string 2-3 sentences), deadline (ISO 8601 date string or null), eligibility (string), url (string or null), type (one of: Competition, Paper Contest, Grant, Hackathon, Fellowship, Workshop, Webinar, Other), status (one of: Live, Upcoming, Closed). Webpage text: ${text}`;

    // Try the current key first, then fail over to the next key on quota exhaustion.
    const tryModel = async (modelName, retries = 3) => {
        let lastError;
        const clientsToTry = getGeminiClientOrder();

        for (let clientIndex = 0; clientIndex < clientsToTry.length; clientIndex++) {
            const { client, keyNumber } = clientsToTry[clientIndex];

            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    const response = await client.models.generateContent({
                        model: modelName,
                        contents: prompt
                    });

                    const output = response.text;
                    const cleanJsonStr = output.replace(/```json/gi, '').replace(/```/g, '').trim();
                    const opportunities = JSON.parse(cleanJsonStr);

                    if (!Array.isArray(opportunities)) {
                        throw new Error('Output is not a JSON array.');
                    }
                    return opportunities;
                } catch (error) {
                    lastError = error;
                    const errMsg = error.message || '';
                    const isQuotaError = error.status === 429 || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED');
                    const isRetryable = error.status === 503 || error.status === 429 ||
                        errMsg.includes('503') || errMsg.includes('429') ||
                        errMsg.includes('UNAVAILABLE') || errMsg.includes('RESOURCE_EXHAUSTED') ||
                        errMsg.includes('fetch failed');

                    if (isRetryable && attempt < retries) {
                        const delayMs = attempt * 2500;
                        console.warn(`[Attempt ${attempt}/${retries}] Model ${modelName} on Gemini key ${keyNumber} returned a temporary error, retrying in ${delayMs}ms...`);
                        await wait(delayMs);
                        continue;
                    }

                    if (isQuotaError && clientIndex < clientsToTry.length - 1) {
                        console.warn(`Gemini key ${keyNumber} quota exhausted for model ${modelName}. Switching to the next configured key...`);
                        break;
                    }

                    throw error;
                }
            }
        }

        throw lastError;
    };

    try {
        console.log(`Attempting extraction with ${GEMINI_PRIMARY_MODEL}...`);
        const opportunities = await tryModel(GEMINI_PRIMARY_MODEL);
        return { success: true, data: opportunities, raw: null };
    } catch (liteError) {
        const errMsg = liteError.message || '';
        const isQuotaError = liteError.status === 429 || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED');

        if (isQuotaError) {
            console.warn(`${GEMINI_PRIMARY_MODEL} quota/rate-limit hit. Trying ${GEMINI_FALLBACK_MODEL} fallback...`);
        } else {
            console.warn(`${GEMINI_PRIMARY_MODEL} parsing failed: ${errMsg}. Falling back to ${GEMINI_FALLBACK_MODEL}...`);
        }

        try {
            const opportunities = await tryModel(GEMINI_FALLBACK_MODEL);
            return { success: true, data: opportunities, raw: null };
        } catch (flashError) {
            const flashMsg = flashError.message || '';
            const flashQuota = flashError.status === 429 || flashMsg.includes('429') || flashMsg.includes('RESOURCE_EXHAUSTED');
            const retryAfter = extractRetryAfterSeconds(flashMsg) ?? extractRetryAfterSeconds(errMsg);

            if (isQuotaError && flashQuota) {
                console.error('Gemini quota/rate-limit exhausted for both models.', flashMsg);
                return {
                    success: false,
                    data: null,
                    raw: flashMsg,
                    error: 'Google AI quota/rate-limit exceeded for both models.',
                    errorType: 'quota',
                    retryAfterSec: retryAfter
                };
            }

            console.error('Both models failed to parse JSON output.', flashMsg);
            return { success: false, data: null, raw: flashMsg, error: `JSON Parse Fallback Failed: ${flashMsg}` };
        }
    }
}

async function scrapeOrganization(organization) {
    if (geminiClients.length === 0) {
        throw new Error('GEMINI_API_KEY is missing');
    }

    const configuredUrls = parseOrganizationScrapeUrls(organization);
    const fallbackUrl = organization.officialWebsite ? String(organization.officialWebsite).trim() : '';
    const candidateUrls = buildCandidateUrls([...configuredUrls, fallbackUrl]);

    if (candidateUrls.length === 0) {
        throw new Error(`Organization ${organization.name} has no URL configured to scrape.`);
    }

    const crawlResult = await crawlRelevantContent(candidateUrls);
    const text = crawlResult.text;
    console.log(`Crawled ${crawlResult.pagesVisited} page(s) for ${organization.name}.`);

    // 2. Send to Gemini
    return await analyzeWithGemini(text);
}

module.exports = {
    scrapeOrganization,
    wait // Exported for queueing mechanism in the router
};
