import pg from 'pg';

/**
 * Type parsers: BIGINT (counters, counts) and NUMERIC (rounded percentages) become JS numbers.
 * Values stay far below Number.MAX_SAFE_INTEGER (allowances are capped at 1e12), and a guard
 * fails loudly rather than silently losing precision. DATE stays a "YYYY-MM-DD" string so the
 * process time zone can never shift a period.
 */
function toSafeNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(Math.trunc(parsed))) throw new Error(`Numeric value ${value} exceeds the safe integer range`);
  return parsed;
}
pg.types.setTypeParser(pg.types.builtins.INT8, toSafeNumber);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, toSafeNumber);
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;
/** Anything that can run a query: the pool, or a client inside a transaction. */
export type Queryable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

export function createPool(connectionString: string, max: number): pg.Pool {
  return new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Every session works in UTC, so date_trunc / to_char on timestamps use UTC days.
    options: '-c TimeZone=UTC',
    application_name: 'usage-metering-api',
  });
}

/**
 * Waits until the database accepts connections (e.g. while a fresh PostgreSQL container is still
 * initializing). Retries every `delayMs` up to `attempts` times, then gives up with the last error.
 */
export async function waitForDatabase(
  pool: pg.Pool,
  onRetry: (attempt: number, error: Error) => void = () => {},
  { attempts = 30, delayMs = 1_000 }: { attempts?: number; delayMs?: number } = {},
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      onRetry(attempt, error as Error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/** PostgreSQL error codes handled explicitly. */
export const PG_ERROR = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01',
} as const;

export function pgErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : undefined;
}

export function pgConstraint(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'constraint' in error ? String((error as { constraint: unknown }).constraint) : undefined;
}
