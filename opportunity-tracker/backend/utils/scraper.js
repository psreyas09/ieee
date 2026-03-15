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
            throw new Error('Page returned too little readable text (likely JS-rendered or blocked). Try a deeper content URL.');
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
        console.log("Attempting extraction with gemini-2.5-flash-lite...");
        const opportunities = await tryModel('gemini-2.5-flash-lite');
        return { success: true, data: opportunities, raw: null };
    } catch (liteError) {
        const errMsg = liteError.message || '';
        const isQuotaError = liteError.status === 429 || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED');

        if (isQuotaError) {
            console.warn('flash-lite quota/rate-limit hit. Trying gemini-2.5-flash fallback...');
        } else {
            console.warn(`flash-lite parsing failed: ${errMsg}. Falling back to gemini-2.5-flash...`);
        }

        try {
            const opportunities = await tryModel('gemini-2.5-flash');
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
    const candidateUrls = [...configuredUrls, fallbackUrl].filter(Boolean);

    if (candidateUrls.length === 0) {
        throw new Error(`Organization ${organization.name} has no URL configured to scrape.`);
    }

    let text = null;
    let lastError = null;
    const attemptErrors = [];

    for (const url of candidateUrls) {
        try {
            text = await fetchAndExtractText(url);
            break;
        } catch (error) {
            lastError = error;
            attemptErrors.push(`${url} -> ${error.message}`);
            console.warn(`Failed to fetch ${url} for ${organization.name}. Trying next URL if available...`);
        }
    }

    if (!text) {
        const details = attemptErrors.length > 0 ? ` Attempts: ${attemptErrors.join(' | ')}` : '';
        throw new Error(`Failed to fetch any scrape URL for ${organization.name}.${details}`);
    }

    // 2. Send to Gemini
    return await analyzeWithGemini(text);
}

module.exports = {
    scrapeOrganization,
    wait // Exported for queueing mechanism in the router
};
