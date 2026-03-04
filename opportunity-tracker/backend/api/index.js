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

        const societiesCovered = await prisma.organization.count({
            where: { type: 'society' }
        });

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
                orderBy: { deadline: 'asc' }, // Defaults to soonest first
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

        // Check simple cooldown (1 hour)
        if (organization.lastScrapedAt) {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            if (organization.lastScrapedAt > oneHourAgo) {
                return res.status(429).json({ error: 'Cooldown active. Try again later.' });
            }
        }

        const result = await scrapeOrganization(organization);

        if (!result.success) {
            return res.status(500).json({ error: 'Failed to process AI output', raw: result.raw });
        }

        // Upsert logic for extracted opportunities
        const opportunities = result.data;
        let addedCount = 0;

        // Add logic to avoid recreating duplicates if exact title for same org already exists
        for (const opp of opportunities) {
            // Only live or upcoming entries are generally scraped with deadlines etc.
            const existing = await prisma.opportunity.findFirst({
                where: {
                    title: opp.title,
                    organizationId: orgId
                }
            });

            if (!existing) {
                let parsedDate = null;
                if (opp.deadline) {
                    const dt = new Date(opp.deadline);
                    if (!isNaN(dt.getTime())) {
                        parsedDate = dt;
                    }
                }

                await prisma.opportunity.create({
                    data: {
                        title: opp.title,
                        description: opp.description || '',
                        deadline: parsedDate,
                        eligibility: opp.eligibility,
                        url: opp.url || organization.officialWebsite,
                        type: opp.type || 'Other',
                        status: opp.status || 'Live',
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
                await prisma.opportunity.update({
                    where: { id: existing.id },
                    data: {
                        lastFetchedAt: new Date(),
                        deadline: parsedDate || existing.deadline,
                        status: opp.status || existing.status,
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
        const org = await prisma.organization.update({
            where: { id: req.params.id },
            data: { scrapeUrl, name, officialWebsite }
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
