require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenAI } = require('@google/genai');
const https = require('https');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

    // Helper to call a specific model and parse with intelligent 503/429 retries
    const tryModel = async (modelName, retries = 3) => {
        let lastError;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: prompt
                });

                const output = response.text;
                const cleanJsonStr = output.replace(/```json/gi, '').replace(/```/g, '').trim();
                const opportunities = JSON.parse(cleanJsonStr);

                if (!Array.isArray(opportunities)) {
                    throw new Error("Output is not a JSON array.");
                }
                return opportunities;
            } catch (error) {
                lastError = error;
                const errMsg = error.message || '';
                const isRetryable = error.status === 503 || error.status === 429 ||
                    errMsg.includes('503') || errMsg.includes('429') ||
                    errMsg.includes('UNAVAILABLE') || errMsg.includes('RESOURCE_EXHAUSTED') ||
                    errMsg.includes('fetch failed');

                if (isRetryable && attempt < retries) {
                    const delayMs = attempt * 2500; // Incrementing backoff (2.5s, 5.0s)
                    console.warn(`[Attempt ${attempt}/${retries}] Model ${modelName} returned Temporary Error (503/429), retrying in ${delayMs}ms...`);
                    await wait(delayMs);
                } else {
                    throw error; // Not retryable or max retries reached, pass to outer fallback
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
            console.warn(`flash-lite quota/rate-limit hit. Aborting to protect flash quota.`);
            return { success: false, data: null, raw: liteError.message, error: `Google AI Quota Exceeded (Please wait a minute): ${liteError.message}` };
        }

        console.warn(`flash-lite parsing failed: ${errMsg}. Falling back to gemini-2.5-flash...`);
        try {
            const opportunities = await tryModel('gemini-2.5-flash');
            return { success: true, data: opportunities, raw: null };
        } catch (flashError) {
            console.error("Both models failed to parse JSON output.", flashError.message);
            return { success: false, data: null, raw: flashError.message, error: `JSON Parse Fallback Failed: ${flashError.message}` };
        }
    }
}

async function scrapeOrganization(organization) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is missing');
    }

    const primaryUrl = organization.scrapeUrl || organization.officialWebsite;
    if (!primaryUrl) {
        throw new Error(`Organization ${organization.name} has no URL configured to scrape.`);
    }

    let text;
    try {
        text = await fetchAndExtractText(primaryUrl);
    } catch (error) {
        const canFallback = organization.scrapeUrl && organization.officialWebsite && organization.scrapeUrl !== organization.officialWebsite;
        const is404 = (error.message || '').includes('status code 404');

        if (!canFallback || !is404) {
            throw error;
        }

        console.warn(`Primary scrape URL failed for ${organization.name}. Retrying with official website...`);
        text = await fetchAndExtractText(organization.officialWebsite);
    }

    // 2. Send to Gemini
    return await analyzeWithGemini(text);
}

module.exports = {
    scrapeOrganization,
    wait // Exported for queueing mechanism in the router
};
