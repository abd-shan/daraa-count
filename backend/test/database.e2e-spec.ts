import { testDatabaseUrl } from './database';
describe('test database safety', () => {
  const previous = process.env.TEST_DATABASE_URL;
  afterEach(() => {
    if (previous === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = previous;
  });
  it('refuses development and unrelated databases', () => {
    for (const name of [
      'count_daraa',
      'production',
      'other_test',
      'count_daraa_test_backup',
    ]) {
      process.env.TEST_DATABASE_URL = 'postgresql://localhost/' + name;
      expect(() => testDatabaseUrl()).toThrow('Refusing');
    }
  });
  it('allows only the dedicated test database', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://localhost/count_daraa_test';
    expect(testDatabaseUrl()).toBe('postgresql://localhost/count_daraa_test');
  });
});
