require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function calculateSimilarity(str1, str2) {
    const stopWords = new Set(['ieee', 'the', 'and', 'for', 'program', 'council', 'society', 'chapter', 'section', 'award', 'awards']);

    // basic plural stemming and filtering
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
    for (let word of set1) {
        if (set2.has(word)) intersection++;
    }

    // Instead of strict Jaccard (intersection/union), use subset inclusion (intersection / minimum set size)
    // This handles "ECE Travel Grant" vs "Biometrics ECE Travel Grant" perfectly
    return intersection / Math.min(set1.size, set2.size);
}

async function main() {
    console.log("Refining semantic duplicates...");
    const opps = await prisma.opportunity.findMany({
        orderBy: { createdAt: 'asc' }
    });

    const byOrg = {};
    for (const opp of opps) {
        if (!byOrg[opp.organizationId]) byOrg[opp.organizationId] = [];
        byOrg[opp.organizationId].push(opp);
    }

    let deletedCount = 0;

    for (const orgId in byOrg) {
        const orgOpps = byOrg[orgId];
        const keepIds = new Set();

        for (let i = 0; i < orgOpps.length; i++) {
            let isDuplicate = false;
            for (let j = 0; j < i; j++) {
                if (!keepIds.has(orgOpps[j].id)) continue;

                const sim = calculateSimilarity(orgOpps[i].title, orgOpps[j].title);
                if (sim > 0.6) { // 60% subset overlap
                    console.log(`Deep Duplicate found (Sim: ${sim.toFixed(2)}):`);
                    console.log(`  Keep: ${orgOpps[j].title}`);
                    console.log(`  Drop: ${orgOpps[i].title}\n`);
                    isDuplicate = true;
                    deletedCount++;

                    await prisma.opportunity.delete({ where: { id: orgOpps[i].id } });
                    break;
                }
            }
            if (!isDuplicate) {
                keepIds.add(orgOpps[i].id);
            }
        }
    }

    console.log(`Removed ${deletedCount} deeply hidden duplicate opportunities.`);
}

main().finally(() => prisma.$disconnect());
