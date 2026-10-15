import pg from 'pg';
import { runMigrations } from '../../src/Infrastructure/Database/migrator';
import { createPool } from '../../src/Infrastructure/Database/postgres';
import { seedDemoData, seedPredefinedPlans } from '../../src/Infrastructure/Database/seed/seed';
import { TEST_DATABASE_URL, maintenanceUrl } from './testDatabase';
import { TEST_DEMO_API_KEY } from './testApp';

/** Recreates the test database from scratch, then migrates and seeds it like a fresh startup. */
export default async function setup(): Promise<void> {
  const { url, database } = maintenanceUrl(TEST_DATABASE_URL);
  if (!/^[a-z0-9_]+$/.test(database) || !database.includes('test')) {
    throw new Error(`Refusing to recreate "${database}": test database names must contain "test".`);
  }
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${database}`);
  await admin.end();

  const pool = createPool(TEST_DATABASE_URL, 2);
  await runMigrations(pool);
  await seedPredefinedPlans(pool);
  await seedDemoData(pool, TEST_DEMO_API_KEY);
  await pool.end();
}
