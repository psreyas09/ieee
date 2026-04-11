const { PrismaClient } = require('/home/sreyas/projects/ieee/opportunity-tracker/backend/node_modules/@prisma/client');

const prisma = new PrismaClient();

(async () => {
  const indexRows = await prisma.$queryRawUnsafe("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'unique_opportunity'");
  const duplicatePairs = await prisma.$queryRawUnsafe('SELECT canonical_url, title, COUNT(*)::int AS count FROM "Opportunity" WHERE canonical_url IS NOT NULL GROUP BY canonical_url, title HAVING COUNT(*) > 1');
  console.log(JSON.stringify({
    uniqueIndex: indexRows[0] || null,
    duplicatePairs: duplicatePairs.length,
    duplicateRows: duplicatePairs,
  }, null, 2));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
