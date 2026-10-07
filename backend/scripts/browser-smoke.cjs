// Synthetic browser fixtures only. Never points at the development database.
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const argon2 = require('argon2');
const { randomBytes, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const directory = path.resolve(__dirname, '../../.tmp');
const fixturePath = path.join(directory, 'browser-fixture.json');
const url = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
if (!process.env.TEST_DATABASE_URL) url.pathname = '/count_daraa_test';
if (url.pathname !== '/count_daraa_test')
  throw Error('Browser fixtures must use count_daraa_test');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
async function check() {
  const rows = await db.$queryRawUnsafe('SELECT current_database() AS name');
  if (rows[0].name !== 'count_daraa_test')
    throw Error('Unsafe browser fixture database');
}
async function main() {
  const command = process.argv[2];
  if (command === 'serve') {
    const child = spawn(process.execPath, ['dist/main.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        NODE_ENV: 'development',
        APP_ORIGIN: 'http://localhost:5173',
        PORT: '3000',
      },
      stdio: 'inherit',
    });
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.on(signal, () => child.kill(signal));
    child.on('exit', (code) => {
      process.exitCode = code || 0;
    });
    return;
  }
  await check();
  try {
    if (command === 'seed') {
      if (fs.existsSync(fixturePath))
        throw Error('A browser fixture already exists; clean it first');
      fs.mkdirSync(directory, { recursive: true });
      const run = randomUUID().slice(0, 8),
        password = randomBytes(24).toString('base64url');
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });
      const fixture = await db.$transaction(async (tx) => {
        const municipality = await tx.municipality.create({
          data: {
            name: 'بلدية اختبار الواجهة ' + run,
            areaName: 'منطقة تجريبية',
          },
        });
        const admin = await tx.user.create({
          data: {
            username: 'ui_admin_' + run,
            role: 'SUPER_ADMIN',
            passwordHash,
          },
        });
        const user = await tx.user.create({
          data: {
            username: 'ui_municipality_' + run,
            role: 'MUNICIPALITY',
            municipalityId: municipality.id,
            passwordHash,
          },
        });
        await tx.censusRecord.create({
          data: {
            municipalityId: municipality.id,
            createdById: user.id,
            category: 'MARTYR',
            personName: 'اسم اختبار مصطنع',
            maritalStatus: 'SINGLE',
            nationalId: '0012345',
            familyMembersCount: 3,
            phone: '0944000000',
          },
        });
        return {
          municipalityId: municipality.id,
          userIds: [admin.id, user.id],
          adminUsername: admin.username,
          municipalityUsername: user.username,
          password,
        };
      });
      fs.writeFileSync(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
      console.log('Synthetic browser fixture ready.');
    } else if (command === 'cleanup') {
      const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      await db.$transaction(async (tx) => {
        // Scope every delete to this fixture, even in the guarded test database.
        await tx.auditLog.deleteMany({
          where: {
            OR: [
              { userId: { in: fixture.userIds } },
              { municipalityId: fixture.municipalityId },
            ],
          },
        });
        await tx.importBatch.deleteMany({
          where: { municipalityId: fixture.municipalityId },
        });
        await tx.censusRecord.deleteMany({
          where: { municipalityId: fixture.municipalityId },
        });
        await tx.session.deleteMany({
          where: { userId: { in: fixture.userIds } },
        });
        await tx.user.deleteMany({
          where: { municipalityId: fixture.municipalityId },
        });
        await tx.user.deleteMany({ where: { id: { in: fixture.userIds } } });
        await tx.municipality.delete({ where: { id: fixture.municipalityId } });
      });
      fs.unlinkSync(fixturePath);
      console.log('Synthetic browser fixture removed.');
    } else throw Error('Use seed, serve or cleanup');
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'Browser fixture operation failed; check test database and fixture state.',
  );
  process.exitCode = 1;
});
