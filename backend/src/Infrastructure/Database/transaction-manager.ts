import type { Repositories, TransactionManager } from '../../Application/Common/TransactionManager';
import { PostgresAccountRepository } from '../Repositories/PostgresAccountRepository';
import { PostgresPlanRepository } from '../Repositories/PostgresPlanRepository';
import { PostgresQuotaRepository } from '../Repositories/PostgresQuotaRepository';
import { PostgresRefreshTokenRepository } from '../Repositories/PostgresRefreshTokenRepository';
import { PostgresSignupRequestRepository } from '../Repositories/PostgresSignupRequestRepository';
import { PostgresUsageRepository } from '../Repositories/PostgresUsageRepository';
import { PostgresUserRepository } from '../Repositories/PostgresUserRepository';
import { PG_ERROR, pgErrorCode, type Pool, type Queryable } from './postgres';

export function createRepositories(db: Queryable): Repositories {
  return {
    accounts: new PostgresAccountRepository(db),
    users: new PostgresUserRepository(db),
    plans: new PostgresPlanRepository(db),
    quotas: new PostgresQuotaRepository(db),
    usage: new PostgresUsageRepository(db),
    signupRequests: new PostgresSignupRequestRepository(db),
    refreshTokens: new PostgresRefreshTokenRepository(db),
  };
}

const RETRYABLE = new Set<string>([PG_ERROR.DEADLOCK_DETECTED, PG_ERROR.SERIALIZATION_FAILURE]);
const MAX_ATTEMPTS = 3;

/**
 * Runs work in BEGIN ... COMMIT on one pooled connection (READ COMMITTED; correctness comes from
 * explicit row/advisory locks, not from the isolation level). Deadlocks and serialization
 * failures are retried a bounded number of times - the whole unit is re-run from scratch, which is
 * safe because nothing outside the transaction was changed.
 */
export class PostgresTransactionManager implements TransactionManager {
  constructor(
    private readonly pool: Pool,
    private readonly onRetry: (attempt: number, code: string) => void = () => {},
  ) {}

  async run<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(createRepositories(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        const code = pgErrorCode(error);
        if (code && RETRYABLE.has(code) && attempt < MAX_ATTEMPTS) {
          this.onRetry(attempt, code);
          continue;
        }
        throw error;
      } finally {
        client.release();
      }
    }
  }
}
