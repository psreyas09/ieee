require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const { scrapeOrganization, wait } = require('../utils/scraper');

const prisma = new PrismaClient();
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// --- Middleware ---
const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// --- Routes ---

// Public Routes
app.get('/api/stats', async (req, res) => {
    try {
        const totalOpportunities = await prisma.opportunity.count();
        const activeOpportunities = await prisma.opportunity.count({
            where: { status: 'Live' }
        });

        // Approximation for 'closing this week' (next 7 days)
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const closingSoon = await prisma.opportunity.count({
            where: {
                status: 'Live',
                deadline: {
                    lte: nextWeek,
                    gte: new Date(),
                }
            }
        });

        const societiesCovered = await prisma.organization.count();

        res.json({
            totalOpportunities,
            activeOpportunities,
            closingSoon,
            societiesCovered
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/organizations', async (req, res) => {
    try {
        const organizations = await prisma.organization.findMany({
            include: {
                _count: {
                    select: { opportunities: { where: { status: 'Live' } } }
                }
            },
            orderBy: { name: 'asc' }
        });
        res.json(organizations);
    } catch (error) {
        console.error('Error fetching organizations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/opportunities', async (req, res) => {
    try {
        const { organizationId, type, status, search, page = 1, limit = 20 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const where = {};
        if (organizationId) where.organizationId = organizationId;
        if (type) where.type = type;
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [opportunities, total] = await Promise.all([
            prisma.opportunity.findMany({
                where,
                include: { organization: true },
                orderBy: [
                    { deadline: 'asc' },
                    { id: 'asc' }
                ],
                skip,
                take: limitNum,
            }),
            prisma.opportunity.count({ where })
        ]);

        res.json({
            data: opportunities,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Error fetching opportunities:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/opportunities/:id', async (req, res) => {
    try {
        const opportunity = await prisma.opportunity.findUnique({
            where: { id: req.params.id },
            include: { organization: true }
        });
        if (!opportunity) return res.status(404).json({ error: 'Not found' });
        res.json(opportunity);
    } catch (error) {
        console.error('Error fetching opportunity:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin Routes
const bcrypt = require('bcryptjs');

app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminUser = await prisma.adminUser.findUnique({
            where: { username: expectedUsername }
        });

        if (!adminUser) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (username !== expectedUsername) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const matches = await bcrypt.compare(password, adminUser.passwordHash);

        // We can also allow direct MATCH against the hash in the env if DB is empty for whatever reason.
        // For now we rely on DB since we seeded it.

        if (!matches) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin protected routes specific to organizations and scraping
app.post('/api/admin/scrape/:id', authenticateAdmin, async (req, res) => {
    try {
        const orgId = req.params.id;
        const organization = await prisma.organization.findUnique({
            where: { id: orgId }
        });

        if (!organization) return res.status(404).json({ error: 'Organization not found' });

        // Check simple cooldown (10 minutes)
        if (organization.lastScrapedAt) {
            const cooldownTime = new Date(Date.now() - 10 * 60 * 1000);
            if (organization.lastScrapedAt > cooldownTime) {
                return res.status(429).json({ error: 'Cooldown active. Try again later.' });
            }
        }

        const result = await scrapeOrganization(organization);

        if (!result.success) {
            return res.status(500).json({ error: 'Failed to process AI output', raw: result.raw });
        }

        function calculateSimilarity(str1, str2) {
            const stopWords = new Set(['ieee', 'the', 'and', 'for', 'program', 'council', 'society', 'chapter', 'section', 'award', 'awards']);

            const processStr = (str) => {
                return str.toLowerCase()
                    .replace(/[^a-z0-9\s]/g, '')
                    .split(/\s+/)
                    .filter(w => w.length > 2 && !stopWords.has(w))
                    .map(w => w.endsWith('s') ? w.slice(0, -1) : w);
            };

            const s1 = processStr(str1);
            const s2 = processStr(str2);
            if (s1.length === 0 || s2.length === 0) return 0;

            const set1 = new Set(s1);
            const set2 = new Set(s2);
            let intersection = 0;
            for (let word of set1) { if (set2.has(word)) intersection++; }

            return intersection / Math.min(set1.size, set2.size);
        }

        // Upsert logic for extracted opportunities
        const opportunities = result.data;
        let addedCount = 0;

        // Fetch all existing active opportunities for deterministic fuzzy comparison
        const allExistingForOrg = await prisma.opportunity.findMany({
            where: { organizationId: orgId, status: { not: 'Closed' } }
        });

        // Add logic to avoid recreating duplicates if exact or highly similar title already exists
        for (const opp of opportunities) {
            // Find semantic match instead of exact
            let existing = null;
            for (const record of allExistingForOrg) {
                if (calculateSimilarity(opp.title, record.title) > 0.5) {
                    existing = record;
                    break;
                }
            }

            if (!existing) {
                let parsedDate = null;
                if (opp.deadline) {
                    const dt = new Date(opp.deadline);
                    if (!isNaN(dt.getTime())) {
                        parsedDate = dt;
                    }
                }

                let finalStatus = opp.status || 'Live';
                if (parsedDate && parsedDate < new Date()) {
                    finalStatus = 'Closed';
                }

                await prisma.opportunity.create({
                    data: {
                        title: opp.title,
                        description: opp.description || '',
                        deadline: parsedDate,
                        eligibility: opp.eligibility,
                        url: opp.url || organization.officialWebsite,
                        type: opp.type || 'Other',
                        status: finalStatus,
                        source: 'auto',
                        organizationId: orgId,
                        lastFetchedAt: new Date()
                    }
                });
                addedCount++;
            } else {
                // Optionally update existing ones
                let parsedDate = null;
                if (opp.deadline) {
                    const dt = new Date(opp.deadline);
                    if (!isNaN(dt.getTime())) {
                        parsedDate = dt;
                    }
                }

                let finalStatus = opp.status || existing.status;
                if (parsedDate && parsedDate < new Date()) {
                    finalStatus = 'Closed';
                } else if (!parsedDate && existing.deadline && existing.deadline < new Date()) {
                    finalStatus = 'Closed';
                }

                await prisma.opportunity.update({
                    where: { id: existing.id },
                    data: {
                        lastFetchedAt: new Date(),
                        deadline: parsedDate || existing.deadline,
                        status: finalStatus,
                        url: opp.url || existing.url
                    }
                });
            }
        }

        await prisma.organization.update({
            where: { id: orgId },
            data: { lastScrapedAt: new Date() }
        });

        res.json({ message: 'Scrape successful', opportunitiesFound: opportunities.length, newAdded: addedCount });

    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Safe manual injector for Regions and Student Hub
app.get('/api/admin/force-seed', async (req, res) => {
    try {
        let addedCount = 0;

        // Ensure student activities is correct
        const studentOrg = await prisma.organization.findFirst({ where: { name: 'IEEE Student Activities' } });
        if (!studentOrg) {
            await prisma.organization.create({
                data: {
                    name: 'IEEE Student Activities',
                    type: 'society',
                    officialWebsite: 'https://students.ieee.org/',
                    scrapeUrl: 'https://students.ieee.org/'
                }
            });
            addedCount++;
        } else if (studentOrg.scrapeUrl !== 'https://students.ieee.org/') {
            await prisma.organization.update({
                where: { id: studentOrg.id },
                data: { scrapeUrl: 'https://students.ieee.org/' }
            });
        }

        const regions = [
            { name: 'IEEE Region 1 (Northeastern US)', web: 'https://ieeer1.org/' },
            { name: 'IEEE Region 2 (Eastern US)', web: 'https://r2.ieee.org/' },
            { name: 'IEEE Region 3 (Southeastern US)', web: 'https://r3.ieee.org/' },
            { name: 'IEEE Region 4 (Central US)', web: 'https://r4.ieee.org/' },
            { name: 'IEEE Region 5 (Southwestern US)', web: 'https://r5.ieee.org/' },
            { name: 'IEEE Region 6 (Western US)', web: 'https://ieee-region6.org/' },
            { name: 'IEEE Region 7 (Canada)', web: 'https://r7.ieee.org/' },
            { name: 'IEEE Region 8 (Europe, Middle East, Africa)', web: 'https://www.ieeer8.org/' },
            { name: 'IEEE Region 9 (Latin America)', web: 'https://www.ewh.ieee.org/reg/9/' },
            { name: 'IEEE Region 10 (Asia and Pacific)', web: 'https://www.ieeer10.org/' }
        ];

        for (const region of regions) {
            const exists = await prisma.organization.findFirst({ where: { name: region.name } });
            if (!exists) {
                await prisma.organization.create({
                    data: { name: region.name, type: 'region', officialWebsite: region.web }
                });
                addedCount++;
            }
        }
        res.json({ success: true, addedOrgCount: addedCount, message: "Database physically patched!" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Automated Cron Scraper (Hourly Batch)
// To be triggered by Vercel Cron Jobs. Secured via CRON_SECRET.
app.get('/api/cron/scrape-batch', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const cronSecret = process.env.CRON_SECRET;

        if (!cronSecret) {
            return res.status(500).json({ error: 'CRON_SECRET is missing in environment variables.' });
        }

        if (authHeader !== `Bearer ${cronSecret}`) {
            return res.status(401).json({ error: 'Unauthorized CRON request' });
        }

        // Fetch only 1 org per run to stay within serverless execution limits.
        const organizations = await prisma.organization.findMany({
            orderBy: { lastScrapedAt: 'asc' }, // nulls are treated as first/oldest in Postgres asc
            take: 1
        });

        if (organizations.length === 0) {
            return res.json({ message: 'No organizations found to scrape.' });
        }

        const results = [];
        for (const org of organizations) {
            try {
                // Shared logic block for processing one org
                const result = await scrapeOrganization(org);

                if (!result.success) {
                    results.push({ org: org.name, status: 'failed', error: result.error });
                    continue; // The finally block will still run and update the timestamp
                }

                // Subset matching logic
                function calculateSimilarity(str1, str2) {
                    const stopWords = new Set(['ieee', 'the', 'and', 'for', 'program', 'council', 'society', 'chapter', 'section', 'award', 'awards']);
                    const processStr = (str) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)).map(w => w.endsWith('s') ? w.slice(0, -1) : w);
                    const s1 = processStr(str1);
                    const s2 = processStr(str2);
                    if (s1.length === 0 || s2.length === 0) return 0;
                    const set1 = new Set(s1);
                    const set2 = new Set(s2);
                    let intersection = 0;
                    for (let word of set1) { if (set2.has(word)) intersection++; }
                    return intersection / Math.min(set1.size, set2.size);
                }

                const opportunities = result.data;
                let addedCount = 0;

                const allExistingForOrg = await prisma.opportunity.findMany({
                    where: { organizationId: org.id, status: { not: 'Closed' } }
                });

                for (const opp of opportunities) {
                    let existing = null;
                    for (const record of allExistingForOrg) {
                        if (calculateSimilarity(opp.title, record.title) > 0.5) {
                            existing = record;
                            break;
                        }
                    }

                    let parsedDate = opp.deadline ? new Date(opp.deadline) : null;
                    if (parsedDate && isNaN(parsedDate.getTime())) parsedDate = null;

                    let finalStatus = opp.status || (existing ? existing.status : 'Live');
                    if (parsedDate && parsedDate < new Date()) finalStatus = 'Closed';
                    else if (!parsedDate && existing && existing.deadline && existing.deadline < new Date()) finalStatus = 'Closed';

                    if (!existing) {
                        await prisma.opportunity.create({
                            data: {
                                title: opp.title,
                                description: opp.description || '',
                                deadline: parsedDate,
                                eligibility: opp.eligibility,
                                url: opp.url || org.officialWebsite,
                                type: opp.type || 'Other',
                                status: finalStatus,
                                source: 'auto',
                                organizationId: org.id,
                                lastFetchedAt: new Date()
                            }
                        });
                        addedCount++;
                    } else {
                        await prisma.opportunity.update({
                            where: { id: existing.id },
                            data: {
                                lastFetchedAt: new Date(),
                                deadline: parsedDate || existing.deadline,
                                status: finalStatus,
                                url: opp.url || existing.url
                            }
                        });
                    }
                }

                results.push({ org: org.name, status: 'success', added: addedCount });

            } catch (err) {
                console.error(`Cron error scraping ${org.name}:`, err);
                results.push({ org: org.name, status: 'failed', error: err.message });
            } finally {
                // EXTREMELY IMPORTANT: We MUST update lastScrapedAt even if the scrape failed 
                // due to bot protection (403), 404, or Gemini errors. 
                // Otherwise this org will be stuck at the front of the queue forever, 
                // creating an infinite failure loop that starves other orgs.
                await prisma.organization.update({
                    where: { id: org.id },
                    data: { lastScrapedAt: new Date() }
                });
            }
        }

        res.json({ message: 'Batch cron scrape completed', results });

    } catch (error) {
        console.error('Cron system error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin manual operations
app.post('/api/admin/opportunities', authenticateAdmin, async (req, res) => {
    try {
        const data = req.body;
        const opp = await prisma.opportunity.create({
            data: {
                ...data,
                source: 'manual',
                verified: true, // Manual items are trusted implicitly
                deadline: data.deadline ? new Date(data.deadline) : null
            }
        });
        res.json(opp);
    } catch (error) {
        console.error('Error creating manual opportunity:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/admin/opportunities/:id', authenticateAdmin, async (req, res) => {
    try {
        const data = req.body;
        const opp = await prisma.opportunity.update({
            where: { id: req.params.id },
            data: {
                ...data,
                deadline: data.deadline ? new Date(data.deadline) : null
            }
        });
        res.json(opp);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/opportunities/:id', authenticateAdmin, async (req, res) => {
    try {
        await prisma.opportunity.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/organizations/:id', authenticateAdmin, async (req, res) => {
    try {
        const { scrapeUrl, name, officialWebsite } = req.body;

        const isValidHttpUrl = (value) => {
            try {
                const parsed = new URL(value);
                return parsed.protocol === 'http:' || parsed.protocol === 'https:';
            } catch {
                return false;
            }
        };

        if (typeof scrapeUrl === 'string' && scrapeUrl.trim() && !isValidHttpUrl(scrapeUrl.trim())) {
            return res.status(400).json({ error: 'Invalid scrapeUrl. Must be a valid http(s) URL.' });
        }

        if (typeof officialWebsite === 'string' && officialWebsite.trim() && !isValidHttpUrl(officialWebsite.trim())) {
            return res.status(400).json({ error: 'Invalid officialWebsite. Must be a valid http(s) URL.' });
        }

        const org = await prisma.organization.update({
            where: { id: req.params.id },
            data: {
                scrapeUrl: typeof scrapeUrl === 'string' ? scrapeUrl.trim() : undefined,
                name: typeof name === 'string' ? name.trim() : undefined,
                officialWebsite: typeof officialWebsite === 'string' ? officialWebsite.trim() : undefined
            }
        });
        res.json(org);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Vercel Serverless Export
module.exports = app;

// For local dev
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
