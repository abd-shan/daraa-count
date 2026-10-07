import 'dotenv/config';
export function testDatabaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL;
  const development = process.env.DATABASE_URL;
  if (!configured && !development)
    throw new Error('Set TEST_DATABASE_URL or DATABASE_URL in backend/.env');
  const url = new URL(configured ?? development!);
  if (!configured) url.pathname = '/count_daraa_test';
  if (
    url.pathname !== '/count_daraa_test' ||
    !['postgres:', 'postgresql:'].includes(url.protocol)
  ) {
    throw new Error(
      'Refusing tests/cleanup: database must be exactly count_daraa_test',
    );
  }
  return url.toString();
}
export function configureTestDatabase() {
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.NODE_ENV = 'test';
  process.env.APP_ORIGIN = 'http://localhost:5173';
}
