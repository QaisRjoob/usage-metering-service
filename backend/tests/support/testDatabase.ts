/**
 * Test database location. Override with TEST_DATABASE_URL, e.g. the Compose database:
 *   TEST_DATABASE_URL=postgres://metering:metering@localhost:5433/metering_test
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/metering_test';

export function maintenanceUrl(databaseUrl: string): { url: string; database: string } {
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, '');
  url.pathname = '/postgres';
  return { url: url.toString(), database };
}
