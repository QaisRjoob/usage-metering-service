/**
 * Manual database commands (startup already runs both automatically):
 *   npm run db:migrate   (in backend/)
 *   npm run db:seed      (in backend/)
 */
import { loadConfig } from '../../config/env';
import { runMigrations } from './migrator';
import { createPool } from './postgres';
import { seedDemoData, seedPredefinedPlans } from './seed/seed';

const command = process.argv[2];
const config = loadConfig();
const pool = createPool(config.DATABASE_URL, 2);

try {
  if (command === 'migrate') {
    const applied = await runMigrations(pool, console.log);
    console.log(applied.length === 0 ? 'Database is up to date.' : `Applied ${applied.length} migration(s).`);
  } else if (command === 'seed') {
    await seedPredefinedPlans(pool);
    if (config.SEED_DEMO_DATA) await seedDemoData(pool, config.DEMO_API_KEY);
    console.log(`Seeded predefined plans${config.SEED_DEMO_DATA ? ' and demo data' : ''}.`);
  } else {
    console.error('Usage: cli.ts <migrate|seed>');
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
