import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Integration and concurrency tests against a real PostgreSQL (never SQLite: locking behaviour must
 * be PostgreSQL's). The global setup recreates the test database, migrates and seeds it.
 * Files run one after another; each test creates its own accounts, so tests stay independent.
 */
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts', 'tests/concurrency/**/*.test.ts'],
    globalSetup: ['tests/support/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
