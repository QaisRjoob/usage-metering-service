import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Unit tests: pure domain/application logic, no database. */
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
