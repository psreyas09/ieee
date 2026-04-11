require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const newPassword = process.env.NEW_ADMIN_PASSWORD || process.argv[2] || '';

  if (!newPassword || String(newPassword).trim().length < 6) {
    throw new Error('Provide NEW_ADMIN_PASSWORD (or argv[2]) with at least 6 characters.');
  }

  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (!existing) {
    throw new Error(`Admin user not found for username: ${username}`);
  }

  const passwordHash = await bcrypt.hash(String(newPassword), 10);
  await prisma.adminUser.update({
    where: { username },
    data: { passwordHash },
  });

  const updated = await prisma.adminUser.findUnique({ where: { username } });
  const verifyMatch = await bcrypt.compare(String(newPassword), updated.passwordHash);

  console.log(JSON.stringify({ username, passwordUpdated: true, verifyMatch }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
