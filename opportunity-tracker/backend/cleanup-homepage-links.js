require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const parseScrapeUrls = (value) => {
    if (typeof value !== 'string') return [];
    return value
        .split(/\r?\n|,/) 
        .map((item) => item.trim())
        .filter(Boolean);
};

const normalizeUrl = (raw) => {
    if (typeof raw !== 'string' || !raw.trim()) return null;

    try {
        const parsed = new URL(raw.trim());
        parsed.hash = '';
        parsed.search = '';
        parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
        return parsed.toString();
    } catch {
        return null;
    }
};

async function main() {
    const shouldApply = process.argv.includes('--apply');

    const opportunities = await prisma.opportunity.findMany({
        where: { url: { not: null } },
        include: {
            organization: {
                select: {
                    id: true,
                    name: true,
                    officialWebsite: true,
                    scrapeUrl: true
                }
            }
        }
    });

    const candidates = [];

    for (const opp of opportunities) {
        const normalizedOppUrl = normalizeUrl(opp.url);
        if (!normalizedOppUrl) continue;

        const organization = opp.organization;
        const orgHomeCandidates = new Set();

        const officialWebsite = normalizeUrl(organization?.officialWebsite || '');
        if (officialWebsite) orgHomeCandidates.add(officialWebsite);

        const scrapeUrls = parseScrapeUrls(organization?.scrapeUrl || '');
        for (const scrapeUrl of scrapeUrls) {
            const normalized = normalizeUrl(scrapeUrl);
            if (normalized) orgHomeCandidates.add(normalized);
        }

        if (orgHomeCandidates.has(normalizedOppUrl)) {
            candidates.push({
                id: opp.id,
                title: opp.title,
                organizationName: organization?.name || 'Unknown',
                url: opp.url
            });
        }
    }

    console.log(`Found ${candidates.length} opportunities with homepage-like URLs.`);

    if (candidates.length > 0) {
        const preview = candidates.slice(0, 10);
        console.log('Preview (first 10):');
        for (const row of preview) {
            console.log(`- [${row.organizationName}] ${row.title} -> ${row.url}`);
        }
    }

    if (!shouldApply) {
        console.log('Dry run only. Re-run with --apply to set these URLs to null.');
        return;
    }

    if (candidates.length === 0) {
        console.log('No updates needed.');
        return;
    }

    const ids = candidates.map((row) => row.id);
    const result = await prisma.opportunity.updateMany({
        where: { id: { in: ids } },
        data: { url: null }
    });

    console.log(`Updated ${result.count} opportunities (url -> null).`);
}

main()
    .catch((error) => {
        console.error('Cleanup failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
