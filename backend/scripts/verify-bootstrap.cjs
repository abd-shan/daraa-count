// Verifies compiled CLI behavior exclusively with synthetic test fixtures.
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const fixturePath = path.resolve(__dirname, '../../.tmp/browser-fixture.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const url = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
if (!process.env.TEST_DATABASE_URL) url.pathname = '/count_daraa_test';
if (url.pathname !== '/count_daraa_test')
  throw Error('Refusing bootstrap test outside count_daraa_test');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
async function main() {
  try {
    const actual = await db.$queryRawUnsafe(
      'SELECT current_database() AS name',
    );
    if (actual[0].name !== 'count_daraa_test')
      throw Error('Unsafe bootstrap test database');
    const username = 'bootstrap_' + fixture.adminUsername;
    const run = (chosenUsername) =>
      spawnSync(process.execPath, ['dist/bootstrap.js'], {
        env: {
          ...process.env,
          DATABASE_URL: url.toString(),
          NODE_ENV: 'test',
          APP_ORIGIN: 'http://localhost:5173',
          BOOTSTRAP_ADMIN_USERNAME: chosenUsername,
          BOOTSTRAP_ADMIN_PASSWORD: fixture.password,
        },
        encoding: 'utf8',
      });
    if (run(username).status !== 0) throw Error('Bootstrap creation failed');
    const created = await db.user.findUniqueOrThrow({ where: { username } });
    fixture.userIds.push(created.id);
    fs.writeFileSync(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
    if (
      created.role !== 'SUPER_ADMIN' ||
      created.municipalityId !== null ||
      created.passwordHash === fixture.password
    )
      throw Error('Invalid bootstrap account');
    if (run(username).status !== 0) throw Error('Bootstrap idempotence failed');
    const again = await db.user.findUniqueOrThrow({ where: { username } });
    if (again.passwordHash !== created.passwordHash)
      throw Error('Bootstrap changed an existing password');
    if (run(fixture.municipalityUsername).status !== 1)
      throw Error('Bootstrap promoted a municipality account');
    console.log(
      'Compiled bootstrap passed: hashed password, idempotence, no municipality promotion.',
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
