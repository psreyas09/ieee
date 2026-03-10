require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Verifying Consumer Technology...');

    // Check initial state
    let org = await prisma.organization.findFirst({
        where: { name: 'Consumer Technology' }
    });
    console.log('BEFORE:', org);

    // Force exact update
    const result = await prisma.organization.updateMany({
        where: { name: 'Consumer Technology' },
        data: { officialWebsite: 'https://ctsoc.ieee.org/' }
    });
    console.log(`Updated ${result.count} rows.`);

    // Check final state
    org = await prisma.organization.findFirst({
        where: { name: 'Consumer Technology' }
    });
    console.log('AFTER:', org);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
