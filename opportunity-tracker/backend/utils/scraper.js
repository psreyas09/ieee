require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchAndExtractText(url) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
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
        throw new Error(`Failed to fetch and process URL: ${error.message}`);
    }
}

async function analyzeWithGemini(text) {
    const prompt = `From the following webpage text, extract all student competitions, paper contests, grants, hackathons, fellowships, workshops or any opportunities relevant to IEEE student members. Return ONLY a valid JSON array with no extra text, no preamble, no markdown. Each object must have: title (string), description (string 2-3 sentences), deadline (ISO 8601 date string or null), eligibility (string), url (string or null), type (one of: Competition, Paper Contest, Grant, Hackathon, Fellowship, Workshop, Webinar, Other), status (one of: Live, Upcoming, Closed). Webpage text: ${text}`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });

        const output = response.text;

        // Attempt to parse JSON safely
        try {
            // Sometimes models might wrap in markdown even when instructed not to. Clean it if so:
            const cleanJsonStr = output.replace(/```json/gi, '').replace(/```/g, '').trim();
            const opportunities = JSON.parse(cleanJsonStr);

            // Ensure it's an array
            if (!Array.isArray(opportunities)) {
                throw new Error("Output is not a JSON array.");
            }

            return { success: true, data: opportunities, raw: null };
        } catch (parseError) {
            console.error("Failed to parse Gemini JSON output:", parseError.message);
            return { success: false, data: null, raw: output, error: "Failed to parse JSON" };
        }

    } catch (apiError) {
        console.error("Gemini API Error:", apiError);
        throw new Error(`Gemini API Error: ${apiError.message}`);
    }
}

async function scrapeOrganization(organization) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is missing');
    }

    const targetUrl = organization.scrapeUrl || organization.officialWebsite;
    if (!targetUrl) {
        throw new Error(`Organization ${organization.name} has no URL configured to scrape.`);
    }

    // 1. Fetch & strip text
    const text = await fetchAndExtractText(targetUrl);

    // 2. Send to Gemini
    return await analyzeWithGemini(text);
}

module.exports = {
    scrapeOrganization,
    wait // Exported for queueing mechanism in the router
};
