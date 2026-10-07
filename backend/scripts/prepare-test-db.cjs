require('dotenv/config');
const { Client } = require('pg');
const { spawnSync } = require('node:child_process');
async function prepare() {
  const explicit = process.env.TEST_DATABASE_URL;
  const url = new URL(explicit || process.env.DATABASE_URL);
  if (!explicit) url.pathname = '/count_daraa_test';
  if (
    url.pathname !== '/count_daraa_test' ||
    !/^postgres(ql)?:$/.test(url.protocol)
  )
    throw Error('Refusing setup: database must be exactly count_daraa_test');
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const client = new Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      ['count_daraa_test'],
    );
    if (!result.rowCount)
      await client.query('CREATE DATABASE count_daraa_test');
  } finally {
    await client.end();
  }
  // Invoke the installed CLI directly; never let npx download a package.
  const migrated = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: 'inherit',
    },
  );
  if (migrated.status !== 0) throw Error('Test database migration failed');
  console.log('count_daraa_test is ready.');
}
prepare().catch(() => {
  console.error(
    'Test database setup failed. Check connection, CREATE DATABASE permission and migrations.',
  );
  process.exitCode = 1;
});
