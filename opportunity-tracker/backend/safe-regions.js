require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

async function run() {
    try {
        console.log("Injecting regions...");
        for (const region of regions) {
            const exists = await prisma.organization.findFirst({ where: { name: region.name } });
            if (!exists) {
                await prisma.organization.create({
                    data: {
                        name: region.name,
                        type: 'region',
                        officialWebsite: region.web,
                    }
                });
                console.log("Added: " + region.name);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
run();
