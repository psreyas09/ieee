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

const isValidHttpUrl = (value) => {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

const parseScrapeUrls = (value) => {
    if (Array.isArray(value)) {
        return [...new Set(value.map(v => String(v).trim()).filter(Boolean))];
    }

    if (typeof value !== 'string') return [];

    return [...new Set(
        value
            .split(/\r?\n|,/)
            .map(v => v.trim())
            .filter(Boolean)
    )];
};

const serializeScrapeUrls = (urls) => {
    const normalized = parseScrapeUrls(urls);
    return normalized.length > 0 ? normalized.join('\n') : null;
};

const toOrganizationResponse = (org) => {
    const scrapeUrls = parseScrapeUrls(org.scrapeUrl);
    return {
        ...org,
        scrapeUrls,
        scrapeUrl: scrapeUrls[0] || null
    };
};

const monthPattern = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';

const parseOpportunityDate = (value) => {
    if (!value) return null;
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
};

const inferDateFromText = (text) => {
    const source = String(text || '');
    if (!source) return null;

    const rangeMatch = source.match(new RegExp(`${monthPattern}\\s+(\\d{1,2})\\s*[-–]\\s*(\\d{1,2}),\\s*(\\d{4})`, 'i'));
    if (rangeMatch) {
        const inferred = new Date(`${rangeMatch[1]} ${rangeMatch[3]}, ${rangeMatch[4]}`);
        return Number.isNaN(inferred.getTime()) ? null : inferred;
    }

    const fullDateMatch = source.match(new RegExp(`${monthPattern}\\s+(\\d{1,2}),\\s*(\\d{4})`, 'i'));
    if (fullDateMatch) {
        const inferred = new Date(`${fullDateMatch[1]} ${fullDateMatch[2]}, ${fullDateMatch[3]}`);
        return Number.isNaN(inferred.getTime()) ? null : inferred;
    }

    const yearMatch = source.match(/\b(20\d{2})\b/);
    if (yearMatch) {
        const inferredYear = Number(yearMatch[1]);
        const currentYear = new Date().getFullYear();
        if (inferredYear < currentYear) {
            return new Date(`${inferredYear}-12-31T23:59:59.000Z`);
        }
    }

    return null;
};

const deriveOpportunityTiming = (opp, existing = null) => {
    const explicitDate = parseOpportunityDate(opp.deadline);
    const inferredDate = explicitDate || inferDateFromText(`${opp.title || ''} ${opp.description || ''}`);
    const finalDate = inferredDate || existing?.deadline || null;

    let finalStatus = opp.status || existing?.status || 'Live';
    if (finalDate && finalDate < new Date()) {
        finalStatus = 'Closed';
    }

    return { parsedDate: finalDate, finalStatus };
};

const calculateSimilarity = (str1, str2) => {
    const stopWords = new Set(['ieee', 'the', 'and', 'for', 'program', 'council', 'society', 'chapter', 'section', 'award', 'awards']);

    const processStr = (str) => {
        return String(str || '')
            .toLowerCase()
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
    for (const word of set1) {
        if (set2.has(word)) intersection++;
    }

    return intersection / Math.min(set1.size, set2.size);
};

const SCRAPE_MATCH_THRESHOLD = 0.5;
const DUPLICATE_GROUP_THRESHOLD = 0.62;
const DUPLICATE_DATE_WINDOW_DAYS = 60;

const isNonEmpty = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
};

const findPrimaryCandidate = (records) => {
    const statusRank = { Live: 3, Upcoming: 2, Closed: 1 };
    const fieldCompleteness = (row) => {
        return [row.description, row.eligibility, row.url, row.deadline, row.type, row.status]
            .filter(isNonEmpty).length;
    };

    return [...records].sort((a, b) => {
        if (Boolean(a.verified) !== Boolean(b.verified)) return Number(Boolean(b.verified)) - Number(Boolean(a.verified));
        if ((a.source === 'manual') !== (b.source === 'manual')) return Number(b.source === 'manual') - Number(a.source === 'manual');

        const statusDiff = (statusRank[b.status] || 0) - (statusRank[a.status] || 0);
        if (statusDiff !== 0) return statusDiff;

        const completenessDiff = fieldCompleteness(b) - fieldCompleteness(a);
        if (completenessDiff !== 0) return completenessDiff;

        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })[0];
};

const areDatesClose = (left, right) => {
    if (!left || !right) return true;
    const ms = Math.abs(new Date(left).getTime() - new Date(right).getTime());
    return ms <= DUPLICATE_DATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
};

const getBestFieldValue = (records, field) => {
    for (const row of records) {
        if (isNonEmpty(row[field])) return row[field];
    }
    return null;
};

const getNormalizedOpportunityUrl = (value) => {
    if (typeof value !== 'string') return null;
    const cleaned = value.trim();
    if (!cleaned) return null;
    return isValidHttpUrl(cleaned) ? cleaned : null;
};

const GENERIC_LISTING_PATHS = new Set([
    '/',
    '/awards',
    '/award',
    '/events',
    '/event',
    '/news',
    '/students',
    '/student',
    '/opportunities',
    '/opportunity',
    '/webinars',
    '/webinar',
    '/conferences',
    '/conference'
]);

const isGenericListingUrl = (urlValue) => {
    try {
        const parsed = new URL(urlValue);
        const normalizedPath = (parsed.pathname || '/').replace(/\/+$/, '') || '/';

        // Treat section roots as non-specific links; keep deeper pages as candidates.
        if (GENERIC_LISTING_PATHS.has(normalizedPath.toLowerCase())) {
            return true;
        }

        return false;
    } catch {
        return true;
    }
};

const opportunityUrlHealthCache = new Map();
const OPPORTUNITY_URL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const checkUrlWithTimeout = async (url, method, timeoutMs) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            method,
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; IEEE-Opportunity-Tracker/1.0)'
            }
        });
    } finally {
        clearTimeout(timeout);
    }
};

const isUrlHardDead = async (url) => {
    const now = Date.now();
    const cached = opportunityUrlHealthCache.get(url);
    if (cached && (now - cached.checkedAt) < OPPORTUNITY_URL_CACHE_TTL_MS) {
        return cached.hardDead;
    }

    try {
        const headResponse = await checkUrlWithTimeout(url, 'HEAD', 4500);
        if (headResponse.status === 404 || headResponse.status === 410) {
            opportunityUrlHealthCache.set(url, { hardDead: true, checkedAt: now });
            return true;
        }

        if (headResponse.status >= 200 && headResponse.status < 400) {
            opportunityUrlHealthCache.set(url, { hardDead: false, checkedAt: now });
            return false;
        }

        if (headResponse.status === 405) {
            const getResponse = await checkUrlWithTimeout(url, 'GET', 5000);
            const hardDead = getResponse.status === 404 || getResponse.status === 410;
            opportunityUrlHealthCache.set(url, { hardDead, checkedAt: now });
            return hardDead;
        }

        // Keep link for non-404 statuses (403/429/5xx) to avoid dropping valid pages.
        opportunityUrlHealthCache.set(url, { hardDead: false, checkedAt: now });
        return false;
    } catch {
        // Network/transient failure should not erase potentially valid links.
        opportunityUrlHealthCache.set(url, { hardDead: false, checkedAt: now });
        return false;
    }
};

const getValidatedOpportunityUrl = async (value) => {
    const normalized = getNormalizedOpportunityUrl(value);
    if (!normalized) return null;
    if (isGenericListingUrl(normalized)) return null;
    const hardDead = await isUrlHardDead(normalized);
    return hardDead ? null : normalized;
};

const getValidatedOrganizationFallbackUrl = async (value) => {
    const normalized = getNormalizedOpportunityUrl(value);
    if (!normalized) return null;
    const hardDead = await isUrlHardDead(normalized);
    return hardDead ? null : normalized;
};

const processScrapedOpportunities = async (organization, opportunities) => {
    let addedCount = 0;
    const scrapeUrls = parseScrapeUrls(organization?.scrapeUrl);
    const primaryFallbackCandidate = organization?.officialWebsite || null;
    const secondaryFallbackCandidate = scrapeUrls[0] || null;

    let organizationFallbackUrl = await getValidatedOrganizationFallbackUrl(primaryFallbackCandidate);
    if (!organizationFallbackUrl && secondaryFallbackCandidate) {
        organizationFallbackUrl = await getValidatedOrganizationFallbackUrl(secondaryFallbackCandidate);
    }

    const allExistingForOrg = await prisma.opportunity.findMany({
        where: { organizationId: organization.id, status: { not: 'Closed' } }
    });

    for (const opp of opportunities) {
        const candidateUrl = await getValidatedOpportunityUrl(opp.url);

        let existing = null;
        for (const record of allExistingForOrg) {
            if (calculateSimilarity(opp.title, record.title) > SCRAPE_MATCH_THRESHOLD) {
                existing = record;
                break;
            }
        }

        if (!existing) {
            const { parsedDate, finalStatus } = deriveOpportunityTiming(opp);
            const created = await prisma.opportunity.create({
                data: {
                    title: opp.title,
                    description: opp.description || '',
                    deadline: parsedDate,
                    eligibility: opp.eligibility,
                    url: candidateUrl || organizationFallbackUrl,
                    type: opp.type || 'Other',
                    status: finalStatus,
                    source: 'auto',
                    organizationId: organization.id,
                    lastFetchedAt: new Date()
                }
            });
            allExistingForOrg.push(created);
            addedCount++;
            continue;
        }

        const { parsedDate, finalStatus } = deriveOpportunityTiming(opp, existing);
        await prisma.opportunity.update({
            where: { id: existing.id },
            data: {
                lastFetchedAt: new Date(),
                deadline: parsedDate || existing.deadline,
                status: finalStatus,
                url: candidateUrl || existing.url || organizationFallbackUrl
            }
        });
    }

    return { opportunitiesFound: opportunities.length, opportunitiesAdded: addedCount };
};

const executeScrapeForOrganization = async (organization, source) => {
    const startedAt = new Date();
    let status = 'failed';
    let errorMessage = null;
    let opportunitiesFound = 0;
    let opportunitiesAdded = 0;
    let failurePayload = null;
    let failureHttpStatus = 500;

    try {
        const result = await scrapeOrganization(organization);

        if (!result.success) {
            errorMessage = result.error || 'Failed to process AI output';
            if (result.errorType === 'quota') {
                failureHttpStatus = 429;
                failurePayload = {
                    error: result.error,
                    raw: result.raw,
                    retryAfterSec: result.retryAfterSec || null
                };
            } else {
                failurePayload = { error: 'Failed to process AI output', raw: result.raw };
            }
            return {
                success: false,
                httpStatus: failureHttpStatus,
                payload: failurePayload,
                opportunitiesFound,
                opportunitiesAdded,
                errorMessage
            };
        }

        const processed = await processScrapedOpportunities(organization, result.data || []);
        opportunitiesFound = processed.opportunitiesFound;
        opportunitiesAdded = processed.opportunitiesAdded;
        status = 'success';
        return {
            success: true,
            payload: {
                message: 'Scrape successful',
                opportunitiesFound,
                newAdded: opportunitiesAdded
            },
            opportunitiesFound,
            opportunitiesAdded,
            errorMessage: null
        };
    } catch (error) {
        errorMessage = error.message || 'Unexpected scrape error';
        failurePayload = { error: errorMessage };
        return {
            success: false,
            httpStatus: 500,
            payload: failurePayload,
            opportunitiesFound,
            opportunitiesAdded,
            errorMessage
        };
    } finally {
        try {
            await prisma.organization.update({
                where: { id: organization.id },
                data: { lastScrapedAt: new Date() }
            });
        } catch (error) {
            console.error(`Failed to update lastScrapedAt for ${organization.name}:`, error);
        }

        try {
            await prisma.scrapeRunLog.create({
                data: {
                    organizationId: organization.id,
                    startedAt,
                    endedAt: new Date(),
                    status,
                    errorMessage,
                    opportunitiesFound,
                    opportunitiesAdded,
                    source
                }
            });
        } catch (error) {
            console.error(`Failed to persist scrape run log for ${organization.name}:`, error);
        }
    }
};

const computeSuccessRate = (successCount, failedCount) => {
    const total = successCount + failedCount;
    if (total === 0) return 0;
    return Number(((successCount / total) * 100).toFixed(1));
};

const isMissingScrapeRunLogTableError = (error) => {
    const prismaCode = error?.code;
    const tableFromMeta = String(error?.meta?.table || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();

    return prismaCode === 'P2021'
        && (
            tableFromMeta.includes('scraperunlog')
            || message.includes('scraperunlog')
        );
};

const buildScrapeHealthFallbackRow = (organization) => ({
    organizationId: organization.id,
    organizationName: organization.name,
    lastScrapedAt: organization.lastScrapedAt || null,
    lastStatus: 'unknown',
    lastError: null,
    success7d: 0,
    failed7d: 0,
    opportunitiesAdded7d: 0,
    successRate: 0
});

const buildPersonaRestrictionWhere = (persona) => {
    const normalizedPersona = String(persona || '').trim().toLowerCase();
    if (!normalizedPersona) return null;

    const textFields = ['title', 'description', 'eligibility'];

    const phraseFilter = (phrase) => ({
        OR: textFields.map((field) => ({
            [field]: { contains: phrase, mode: 'insensitive' }
        }))
    });

    let exclusionPhrases = [];

    if (normalizedPersona === 'non-ieee member') {
        exclusionPhrases = [
            'ieee members only',
            'only ieee members',
            'must be ieee member',
            'ieee membership required',
            'ieee member required',
            'exclusively for ieee',
            'for ieee members only',
            'available to ieee members',
            'open to ieee members',
            'restricted to ieee members',
            'members of the ieee',
            'ieee members',
            'ieee member',
            'ieee student members',
            'ieee student member',
            'student members',
            'student member',
            'ieee society members',
            'members of ieee',
            'ieee propagation',
            'ieee antennas',
            'ieee council',
            'ieee technical committee',
            'ieee chapter',
            'ias members',
            'pes members',
            'pels members',
            'cs members',
            'ans members',
            'sps members',
            'mtt members',
            'mga members',
            'cis members',
            'ras members',
            'leos members',
            'sscs members',
            'vehicular technology society',
            'reliability society',
            'engineering management society',
            'eta society',
            'nuclear plasma sciences',
            'electromagnetic compatibility',
            'industrial electronics society'
        ];
    } else if (normalizedPersona === 'young professional') {
        exclusionPhrases = [
            'students only',
            'student members only',
            'undergraduate students only',
            'graduate students only',
            'for undergraduate students only',
            'for graduate students only',
            'for students only',
            'open to students',
            'eligible for students',
            'current students',
            'enrolled students',
            'bachelor students only',
            'masters students only',
            'phd students only',
            'postgraduate students only',
            'student programs',
            'student competition',
            'student award',
            'student scholarship',
            'student members',
            'for students',
            'student branch'
        ];
    } else if (normalizedPersona === 'undergraduate student') {
        exclusionPhrases = [
            'graduate students only',
            'postgraduate students only',
            'masters students only',
            'phd students only',
            'young professionals only',
            'professionals only',
            'for graduates only',
            'graduate programs',
            'masters level',
            'doctoral candidates',
            'post-degree',
            'graduate students',
            'graduate award',
            'graduate competition',
            'graduate scholarship',
            'masters program',
            'phd program',
            'postdoctoral'
        ];
    } else if (normalizedPersona === 'graduate student') {
        exclusionPhrases = [
            'undergraduate students only',
            'bachelor students only',
            'undergraduates only',
            'young professionals only',
            'professionals only',
            'for undergraduates only',
            'for bachelors only',
            'high school students',
            'first year students',
            'undergraduate students',
            'undergraduate award',
            'undergraduate competition',
            'undergraduate scholarship',
            'bachelor degree',
            'bachelors program',
            'undergraduate program'
        ];
    }

    if (exclusionPhrases.length === 0) return null;

    return {
        NOT: exclusionPhrases.map((phrase) => phraseFilter(phrase))
    };
};

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

        // Use day boundaries for consistency with card-level "Closing Soon" labels.
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
        const endOfWindow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7, 23, 59, 59, 999);
        const closingSoon = await prisma.opportunity.count({
            where: {
                status: 'Live',
                deadline: {
                    lte: endOfWindow,
                    gte: startOfToday,
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
        res.json(organizations.map(toOrganizationResponse));
    } catch (error) {
        console.error('Error fetching organizations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/opportunities', async (req, res) => {
    try {
        const { organizationId, type, types, status, search, sort, persona, page = 1, limit = 20 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const where = {};
        if (organizationId) where.organizationId = organizationId;
        const normalizedTypes = String(types || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);

        if (normalizedTypes.length > 0) {
            where.type = { in: normalizedTypes };
        } else if (type) {
            where.type = type;
        }
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        const personaRestriction = buildPersonaRestrictionWhere(persona);
        if (personaRestriction) {
            where.AND = [...(where.AND || []), personaRestriction];
        }

        const orderBy = sort === 'recent'
            ? [
                { updatedAt: 'desc' },
                { createdAt: 'desc' },
                { id: 'desc' }
            ]
            : [
                { deadline: 'asc' },
                { id: 'asc' }
            ];

        const [opportunities, total] = await Promise.all([
            prisma.opportunity.findMany({
                where,
                include: {
                    organization: {
                        select: {
                            id: true,
                            name: true,
                            type: true
                        }
                    }
                },
                orderBy,
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
        const cooldownMs = 10 * 60 * 1000;
        const organization = await prisma.organization.findUnique({
            where: { id: orgId }
        });

        if (!organization) return res.status(404).json({ error: 'Organization not found' });

        // Check simple cooldown (10 minutes)
        if (organization.lastScrapedAt) {
            const elapsedMs = Date.now() - new Date(organization.lastScrapedAt).getTime();
            if (elapsedMs < cooldownMs) {
                const retryAfterSec = Math.max(1, Math.ceil((cooldownMs - elapsedMs) / 1000));
                return res.status(429).json({
                    error: 'Cooldown active. Try again later.',
                    reason: 'cooldown',
                    retryAfterSec,
                    lastScrapedAt: organization.lastScrapedAt,
                    organizationId: organization.id,
                    organizationName: organization.name
                });
            }
        }

        const scrape = await executeScrapeForOrganization(organization, 'manual');

        if (!scrape.success) {
            return res.status(scrape.httpStatus || 500).json(scrape.payload);
        }

        res.json(scrape.payload);

    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/scrape-health', authenticateAdmin, async (req, res) => {
    try {
        const organizations = await prisma.organization.findMany({
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                lastScrapedAt: true
            }
        });

        const orgIds = organizations.map(org => org.id);
        const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));

        let latestRuns = [];
        let weeklyRuns = [];

        try {
            [latestRuns, weeklyRuns] = await Promise.all([
                prisma.scrapeRunLog.findMany({
                    where: { organizationId: { in: orgIds } },
                    orderBy: { startedAt: 'desc' }
                }),
                prisma.scrapeRunLog.findMany({
                    where: {
                        organizationId: { in: orgIds },
                        startedAt: { gte: sevenDaysAgo }
                    }
                })
            ]);
        } catch (error) {
            if (!isMissingScrapeRunLogTableError(error)) throw error;

            console.warn('ScrapeRunLog table missing. Returning scrape health fallback data. Apply Prisma migrations in production.');
            return res.json({
                data: organizations.map(buildScrapeHealthFallbackRow),
                warning: 'ScrapeRunLog table missing. Run Prisma migration to enable scrape health metrics.'
            });
        }

        const latestRunByOrg = new Map();
        for (const run of latestRuns) {
            if (!latestRunByOrg.has(run.organizationId)) {
                latestRunByOrg.set(run.organizationId, run);
            }
        }

        const weeklyByOrg = new Map();
        for (const run of weeklyRuns) {
            const bucket = weeklyByOrg.get(run.organizationId) || {
                success7d: 0,
                failed7d: 0,
                opportunitiesAdded7d: 0
            };

            if (run.status === 'success') bucket.success7d += 1;
            if (run.status === 'failed') bucket.failed7d += 1;
            bucket.opportunitiesAdded7d += run.opportunitiesAdded || 0;
            weeklyByOrg.set(run.organizationId, bucket);
        }

        const data = organizations.map((org) => {
            const latestRun = latestRunByOrg.get(org.id) || null;
            const weekly = weeklyByOrg.get(org.id) || {
                success7d: 0,
                failed7d: 0,
                opportunitiesAdded7d: 0
            };

            return {
                organizationId: org.id,
                organizationName: org.name,
                lastScrapedAt: org.lastScrapedAt || latestRun?.startedAt || null,
                lastStatus: latestRun?.status || 'unknown',
                lastError: latestRun?.errorMessage || null,
                success7d: weekly.success7d,
                failed7d: weekly.failed7d,
                opportunitiesAdded7d: weekly.opportunitiesAdded7d,
                successRate: computeSuccessRate(weekly.success7d, weekly.failed7d)
            };
        });

        res.json({ data });
    } catch (error) {
        console.error('Error fetching scrape health:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/admin/scrape-health/:orgId', authenticateAdmin, async (req, res) => {
    try {
        const organization = await prisma.organization.findUnique({
            where: { id: req.params.orgId },
            select: { id: true, name: true, lastScrapedAt: true }
        });

        if (!organization) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
        let latestRun = null;
        let weeklyRuns = [];

        try {
            [latestRun, weeklyRuns] = await Promise.all([
                prisma.scrapeRunLog.findFirst({
                    where: { organizationId: organization.id },
                    orderBy: { startedAt: 'desc' }
                }),
                prisma.scrapeRunLog.findMany({
                    where: {
                        organizationId: organization.id,
                        startedAt: { gte: sevenDaysAgo }
                    }
                })
            ]);
        } catch (error) {
            if (!isMissingScrapeRunLogTableError(error)) throw error;

            console.warn(`ScrapeRunLog table missing. Returning fallback scrape health for org ${organization.id}.`);
            return res.json({
                data: buildScrapeHealthFallbackRow(organization),
                warning: 'ScrapeRunLog table missing. Run Prisma migration to enable scrape health metrics.'
            });
        }

        const success7d = weeklyRuns.filter(run => run.status === 'success').length;
        const failed7d = weeklyRuns.filter(run => run.status === 'failed').length;
        const opportunitiesAdded7d = weeklyRuns.reduce((sum, run) => sum + (run.opportunitiesAdded || 0), 0);

        res.json({
            data: {
                organizationId: organization.id,
                organizationName: organization.name,
                lastScrapedAt: organization.lastScrapedAt || latestRun?.startedAt || null,
                lastStatus: latestRun?.status || 'unknown',
                lastError: latestRun?.errorMessage || null,
                success7d,
                failed7d,
                opportunitiesAdded7d,
                successRate: computeSuccessRate(success7d, failed7d)
            }
        });
    } catch (error) {
        console.error('Error fetching scrape health detail:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/admin/duplicates', authenticateAdmin, async (req, res) => {
    try {
        const opportunities = await prisma.opportunity.findMany({
            include: {
                organization: {
                    select: { id: true, name: true }
                }
            },
            orderBy: [
                { organizationId: 'asc' },
                { updatedAt: 'desc' }
            ]
        });

        const opportunitiesByOrg = new Map();
        for (const opp of opportunities) {
            const bucket = opportunitiesByOrg.get(opp.organizationId) || [];
            bucket.push(opp);
            opportunitiesByOrg.set(opp.organizationId, bucket);
        }

        const groups = [];

        for (const [organizationId, orgOpps] of opportunitiesByOrg.entries()) {
            const graph = new Map();
            const pairScores = new Map();
            for (const opp of orgOpps) {
                graph.set(opp.id, new Set());
            }

            for (let i = 0; i < orgOpps.length; i++) {
                for (let j = i + 1; j < orgOpps.length; j++) {
                    const left = orgOpps[i];
                    const right = orgOpps[j];
                    if (!areDatesClose(left.deadline, right.deadline)) continue;

                    const score = calculateSimilarity(left.title, right.title);
                    if (score < DUPLICATE_GROUP_THRESHOLD) continue;

                    graph.get(left.id).add(right.id);
                    graph.get(right.id).add(left.id);
                    pairScores.set(`${left.id}|${right.id}`, Number(score.toFixed(3)));
                }
            }

            const visited = new Set();
            for (const opp of orgOpps) {
                if (visited.has(opp.id)) continue;
                const queue = [opp.id];
                const componentIds = [];
                visited.add(opp.id);

                while (queue.length > 0) {
                    const current = queue.shift();
                    componentIds.push(current);
                    for (const next of graph.get(current)) {
                        if (visited.has(next)) continue;
                        visited.add(next);
                        queue.push(next);
                    }
                }

                if (componentIds.length < 2) continue;

                const candidates = componentIds
                    .map(id => orgOpps.find(row => row.id === id))
                    .filter(Boolean)
                    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

                const recommendedPrimary = findPrimaryCandidate(candidates);
                const similarity = [];
                for (let i = 0; i < candidates.length; i++) {
                    for (let j = i + 1; j < candidates.length; j++) {
                        const first = candidates[i];
                        const second = candidates[j];
                        const key = `${first.id}|${second.id}`;
                        const reverseKey = `${second.id}|${first.id}`;
                        const score = pairScores.get(key) ?? pairScores.get(reverseKey);
                        if (score === undefined) continue;
                        similarity.push({ leftId: first.id, rightId: second.id, score });
                    }
                }

                groups.push({
                    groupId: `${organizationId}:${recommendedPrimary.id}`,
                    organizationId,
                    organizationName: candidates[0]?.organization?.name || 'Unknown',
                    recommendedPrimaryId: recommendedPrimary.id,
                    similarity,
                    candidates: candidates.map((item) => ({
                        id: item.id,
                        title: item.title,
                        organizationId: item.organizationId,
                        organizationName: item.organization?.name || 'Unknown',
                        deadline: item.deadline,
                        status: item.status,
                        updatedAt: item.updatedAt,
                        source: item.source,
                        verified: item.verified,
                        url: item.url
                    }))
                });
            }
        }

        groups.sort((a, b) => a.organizationName.localeCompare(b.organizationName));

        res.json({ data: groups });
    } catch (error) {
        console.error('Error finding duplicates:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/admin/duplicates/merge', authenticateAdmin, async (req, res) => {
    try {
        const { primaryId, duplicateIds, allowCrossOrganization = false } = req.body || {};

        const primary = typeof primaryId === 'string' ? primaryId.trim() : '';
        const duplicates = Array.isArray(duplicateIds)
            ? [...new Set(duplicateIds.map(id => String(id).trim()).filter(Boolean))]
            : [];

        if (!primary) {
            return res.status(400).json({ error: 'primaryId is required' });
        }

        if (duplicates.length === 0) {
            return res.status(400).json({ error: 'duplicateIds must include at least one id' });
        }

        if (duplicates.includes(primary)) {
            return res.status(400).json({ error: 'primaryId cannot be merged into itself' });
        }

        const ids = [primary, ...duplicates];
        const records = await prisma.opportunity.findMany({
            where: { id: { in: ids } },
            orderBy: { updatedAt: 'desc' }
        });

        if (records.length !== ids.length) {
            return res.status(404).json({ error: 'One or more opportunities were not found' });
        }

        const primaryRecord = records.find(row => row.id === primary);
        if (!primaryRecord) {
            return res.status(404).json({ error: 'Primary opportunity not found' });
        }

        if (!allowCrossOrganization) {
            const orgId = primaryRecord.organizationId;
            const crossOrg = records.find(row => row.organizationId !== orgId);
            if (crossOrg) {
                return res.status(400).json({ error: 'Cannot merge opportunities across different organizations' });
            }
        }

        const mergedCandidates = [primaryRecord, ...records.filter(row => row.id !== primary)].sort((a, b) => {
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });

        const mergedData = {
            title: getBestFieldValue([primaryRecord, ...mergedCandidates], 'title') || primaryRecord.title,
            description: getBestFieldValue([primaryRecord, ...mergedCandidates], 'description') || '',
            eligibility: getBestFieldValue([primaryRecord, ...mergedCandidates], 'eligibility'),
            url: getBestFieldValue([primaryRecord, ...mergedCandidates], 'url'),
            type: getBestFieldValue([primaryRecord, ...mergedCandidates], 'type') || primaryRecord.type,
            status: getBestFieldValue([primaryRecord, ...mergedCandidates], 'status') || primaryRecord.status,
            deadline: getBestFieldValue([primaryRecord, ...mergedCandidates], 'deadline') || primaryRecord.deadline,
            lastFetchedAt: getBestFieldValue([primaryRecord, ...mergedCandidates], 'lastFetchedAt') || primaryRecord.lastFetchedAt,
            verified: mergedCandidates.some(row => row.verified),
            source: primaryRecord.source || getBestFieldValue(mergedCandidates, 'source') || 'auto'
        };

        await prisma.$transaction(async (tx) => {
            await tx.opportunity.update({
                where: { id: primary },
                data: mergedData
            });

            await tx.opportunity.deleteMany({
                where: { id: { in: duplicates } }
            });
        });

        res.json({
            success: true,
            keptId: primary,
            mergedCount: duplicates.length,
            mergedIds: duplicates
        });
    } catch (error) {
        console.error('Error merging duplicates:', error);
        res.status(500).json({ error: 'Internal server error' });
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
        } else if (!studentOrg.scrapeUrl) {
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

        // Fetch 5 orgs per run (oldest-scraped-first). maxDuration is 60s via vercel.json builds config.
        const organizations = await prisma.organization.findMany({
            orderBy: { lastScrapedAt: 'asc' }, // nulls/oldest first
            take: 5
        });

        if (organizations.length === 0) {
            return res.json({ message: 'No organizations found to scrape.' });
        }

        const results = [];
        for (const org of organizations) {
            try {
                const scrape = await executeScrapeForOrganization(org, 'cron');
                if (!scrape.success) {
                    results.push({ org: org.name, status: 'failed', error: scrape.errorMessage || scrape.payload?.error || 'Unknown error' });
                    continue;
                }

                results.push({ org: org.name, status: 'success', added: scrape.opportunitiesAdded });

            } catch (err) {
                console.error(`Cron error scraping ${org.name}:`, err);
                results.push({ org: org.name, status: 'failed', error: err.message });
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

app.post('/api/admin/opportunities/:id/verify', authenticateAdmin, async (req, res) => {
    try {
        const { verified } = req.body;
        const opp = await prisma.opportunity.update({
            where: { id: req.params.id },
            data: { verified: Boolean(verified) }
        });
        res.json(opp);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/organizations', authenticateAdmin, async (req, res) => {
    try {
        const { name, type, officialWebsite, scrapeUrl, scrapeUrls } = req.body;

        const cleanedName = typeof name === 'string' ? name.trim() : '';
        const cleanedType = typeof type === 'string' ? type.trim().toLowerCase() : '';

        if (!cleanedName) {
            return res.status(400).json({ error: 'Organization name is required.' });
        }

        if (!['society', 'council', 'region', 'other'].includes(cleanedType)) {
            return res.status(400).json({ error: 'Organization type must be society, council, region, or other.' });
        }

        const nextOfficialWebsite = typeof officialWebsite === 'string' ? officialWebsite.trim() : null;
        if (nextOfficialWebsite && !isValidHttpUrl(nextOfficialWebsite)) {
            return res.status(400).json({ error: 'Invalid officialWebsite. Must be a valid http(s) URL.' });
        }

        const nextScrapeUrls = parseScrapeUrls(scrapeUrls !== undefined ? scrapeUrls : scrapeUrl);
        const invalidUrl = nextScrapeUrls.find(url => !isValidHttpUrl(url));
        if (invalidUrl) {
            return res.status(400).json({ error: `Invalid scrape URL: ${invalidUrl}` });
        }

        const existing = await prisma.organization.findFirst({ where: { name: cleanedName } });
        if (existing) {
            return res.status(409).json({ error: 'Organization with this name already exists.' });
        }

        const org = await prisma.organization.create({
            data: {
                name: cleanedName,
                type: cleanedType,
                officialWebsite: nextOfficialWebsite,
                scrapeUrl: serializeScrapeUrls(nextScrapeUrls)
            }
        });

        res.json(toOrganizationResponse(org));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/organizations/:id/scrape-urls', authenticateAdmin, async (req, res) => {
    try {
        const { url } = req.body;
        const nextUrl = typeof url === 'string' ? url.trim() : '';

        if (!nextUrl || !isValidHttpUrl(nextUrl)) {
            return res.status(400).json({ error: 'Invalid URL. Must be a valid http(s) URL.' });
        }

        const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
        if (!org) return res.status(404).json({ error: 'Organization not found' });

        const updated = [...new Set([...parseScrapeUrls(org.scrapeUrl), nextUrl])];
        const saved = await prisma.organization.update({
            where: { id: req.params.id },
            data: { scrapeUrl: serializeScrapeUrls(updated) }
        });

        res.json(toOrganizationResponse(saved));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/organizations/:id/scrape-urls', authenticateAdmin, async (req, res) => {
    try {
        const { url } = req.body;
        const targetUrl = typeof url === 'string' ? url.trim() : '';

        if (!targetUrl) {
            return res.status(400).json({ error: 'URL is required for deletion.' });
        }

        const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
        if (!org) return res.status(404).json({ error: 'Organization not found' });

        const updated = parseScrapeUrls(org.scrapeUrl).filter(existing => existing !== targetUrl);
        const saved = await prisma.organization.update({
            where: { id: req.params.id },
            data: { scrapeUrl: serializeScrapeUrls(updated) }
        });

        res.json(toOrganizationResponse(saved));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/organizations/:id', authenticateAdmin, async (req, res) => {
    try {
        const { scrapeUrl, scrapeUrls, name, officialWebsite } = req.body;

        let nextScrapeUrl;
        const hasScrapeUrlPayload = scrapeUrls !== undefined || scrapeUrl !== undefined;
        if (hasScrapeUrlPayload) {
            const nextScrapeUrls = parseScrapeUrls(scrapeUrls !== undefined ? scrapeUrls : scrapeUrl);
            const invalidUrl = nextScrapeUrls.find(url => !isValidHttpUrl(url));
            if (invalidUrl) {
                return res.status(400).json({ error: `Invalid scrape URL: ${invalidUrl}` });
            }
            nextScrapeUrl = serializeScrapeUrls(nextScrapeUrls);
        }

        if (typeof officialWebsite === 'string' && officialWebsite.trim() && !isValidHttpUrl(officialWebsite.trim())) {
            return res.status(400).json({ error: 'Invalid officialWebsite. Must be a valid http(s) URL.' });
        }

        const org = await prisma.organization.update({
            where: { id: req.params.id },
            data: {
                scrapeUrl: hasScrapeUrlPayload ? nextScrapeUrl : undefined,
                name: typeof name === 'string' ? name.trim() : undefined,
                officialWebsite: typeof officialWebsite === 'string' ? officialWebsite.trim() : undefined
            }
        });
        res.json(toOrganizationResponse(org));
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
