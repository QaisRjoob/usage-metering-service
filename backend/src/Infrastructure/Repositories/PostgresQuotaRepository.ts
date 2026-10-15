import type { QuotaRepository } from '../../Application/Modules/Quotas/Interfaces/QuotaRepository';
import { periodToDate, type QuotaPeriod } from '../../Domain/Quotas/QuotaPeriod';
import type { Queryable } from '../Database/postgres';

type CounterTable = 'account_usage_counters' | 'user_usage_counters';
const KEY_COLUMN: Record<CounterTable, string> = { account_usage_counters: 'account_id', user_usage_counters: 'user_id' };

/**
 * Counter rows: account_usage_counters (account_id, period) and user_usage_counters (user_id, period).
 * Lock order is always account counter, then user counter.
 */
export class PostgresQuotaRepository implements QuotaRepository {
  constructor(private readonly db: Queryable) {}

  /**
   * Common case: the row exists -> one SELECT ... FOR UPDATE. First request of a month: the row is
   * missing -> INSERT ... ON CONFLICT DO NOTHING (a concurrent first request waits on the other's
   * insert instead of failing) and lock it with a second SELECT ... FOR UPDATE.
   */
  private async lockCounter(table: CounterTable, id: string, period: QuotaPeriod): Promise<number> {
    const key = KEY_COLUMN[table];
    const date = periodToDate(period);
    const select = `SELECT consumed FROM ${table} WHERE ${key} = $1 AND period = $2 FOR UPDATE`;
    const existing = await this.db.query<{ consumed: number }>(select, [id, date]);
    if (existing.rows[0]) return existing.rows[0].consumed;
    await this.db.query(`INSERT INTO ${table} (${key}, period) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, date]);
    const created = await this.db.query<{ consumed: number }>(select, [id, date]);
    if (!created.rows[0]) throw new Error(`Counter row ${table}(${id}, ${date}) could not be created`);
    return created.rows[0].consumed;
  }

  lockAccountCounter(accountId: string, period: QuotaPeriod): Promise<number> {
    return this.lockCounter('account_usage_counters', accountId, period);
  }

  lockUserCounter(userId: string, period: QuotaPeriod): Promise<number> {
    return this.lockCounter('user_usage_counters', userId, period);
  }

  async increment(accountId: string, userId: string, period: QuotaPeriod, units: number): Promise<{ accountConsumed: number; userConsumed: number }> {
    const { rows } = await this.db.query<{ account_consumed: number; user_consumed: number }>(
      `WITH a AS (
         UPDATE account_usage_counters SET consumed = consumed + $4, updated_at = now()
         WHERE account_id = $1 AND period = $3 RETURNING consumed
       ), u AS (
         UPDATE user_usage_counters SET consumed = consumed + $4, updated_at = now()
         WHERE user_id = $2 AND period = $3 RETURNING consumed
       )
       SELECT a.consumed AS account_consumed, u.consumed AS user_consumed FROM a, u`,
      [accountId, userId, periodToDate(period), units],
    );
    if (!rows[0]) throw new Error('Counter rows missing during increment');
    return { accountConsumed: rows[0].account_consumed, userConsumed: rows[0].user_consumed };
  }

  async readConsumed(accountId: string, userId: string, period: QuotaPeriod): Promise<{ accountConsumed: number; userConsumed: number }> {
    const { rows } = await this.db.query<{ account_consumed: number; user_consumed: number }>(
      `SELECT COALESCE((SELECT consumed FROM account_usage_counters WHERE account_id = $1 AND period = $3), 0) AS account_consumed,
              COALESCE((SELECT consumed FROM user_usage_counters WHERE user_id = $2 AND period = $3), 0) AS user_consumed`,
      [accountId, userId, periodToDate(period)],
    );
    return { accountConsumed: rows[0]?.account_consumed ?? 0, userConsumed: rows[0]?.user_consumed ?? 0 };
  }
}
