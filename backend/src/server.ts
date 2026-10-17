import { buildApp } from './app';
import { loadConfig, securityWarnings } from './config/env';
import { createContainer } from './container';
import { OpenAIProvider } from './Infrastructure/AI/Providers/OpenAIProvider';
import { runMigrations } from './Infrastructure/Database/migrator';
import { createPool, waitForDatabase } from './Infrastructure/Database/postgres';
import { seedDemoData, seedPredefinedPlans } from './Infrastructure/Database/seed/seed';

/** Process entry point: config -> database (migrate + seed) -> container -> HTTP server. */
async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL, config.DATABASE_POOL_MAX);
  const container = createContainer({
    config,
    pool,
    // Only called while serving requests, i.e. after `app` exists.
    onTransactionRetry: (attempt, code) => app.log.warn({ attempt, code }, 'transaction retried after a deadlock/serialization failure'),
    onRefreshReuse: (familyId) => app.log.warn({ familyId }, 'refresh token reused: session revoked'),
  });
  const app = await buildApp(container);
  await waitForDatabase(pool, (attempt, error) => app.log.warn({ attempt, err: error.message }, 'database not reachable yet; retrying'));

  if (config.RUN_MIGRATIONS) {
    const applied = await runMigrations(pool, (message) => app.log.info(message));
    app.log.info({ applied: applied.length }, 'migrations checked');
  }
  await seedPredefinedPlans(pool);
  if (config.SEED_DEMO_DATA) await seedDemoData(pool, config.DEMO_API_KEY);
  for (const warning of securityWarnings(config)) app.log.warn(`SECURITY: ${warning}`);
  app.log.info({ demoData: config.SEED_DEMO_DATA }, 'seed checked');

  if (container.aiProvider instanceof OpenAIProvider) {
    const ok = await container.aiProvider.verifyModel();
    if (ok) app.log.info({ model: config.OPENAI_MODEL }, 'OpenAI model verified');
    else app.log.warn({ model: config.OPENAI_MODEL }, 'OpenAI model could not be verified; AI requests may fail');
  } else {
    app.log.info('AI provider: mock');
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
