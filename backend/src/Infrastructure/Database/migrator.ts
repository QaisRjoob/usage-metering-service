import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from './postgres';

/** Arbitrary constant: only one process applies migrations at a time. */
const MIGRATION_LOCK_KEY = 72_310_001;

/** Source tree in development (tsx), dist/migrations in the built image. */
function migrationsDirectory(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(here, 'migrations'), path.join(here, 'Infrastructure', 'Database', 'migrations')];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Migrations directory not found (looked in ${candidates.join(', ')})`);
  return found;
}

/**
 * Applies pending *.sql files in name order, each in its own transaction, recording them in
 * schema_migrations. Safe to run on every startup and from several instances (advisory lock).
 */
export async function runMigrations(pool: Pool, log: (message: string) => void = () => {}): Promise<string[]> {
  const directory = migrationsDirectory();
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query<{ version: string }>('SELECT version FROM schema_migrations');
    const done = new Set(rows.map((row) => row.version));
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(directory, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      applied.push(file);
      log(`Applied migration ${file}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
  return applied;
}
