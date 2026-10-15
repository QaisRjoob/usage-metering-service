import type { AccountTotals, AnalyticsRepository } from '../../Application/Modules/Usage/Interfaces/AnalyticsRepository';
import { periodToDate, type QuotaPeriod } from '../../Domain/Quotas/QuotaPeriod';
import type { Queryable } from '../Database/postgres';
import { statusSql } from './sqlFragments';

/** Cross-account totals from the counter tables - one row per account, never raw usage records. */
export class PostgresAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly db: Queryable) {}

  async accountTotals(period: QuotaPeriod): Promise<AccountTotals> {
    const status = statusSql('t.allowance', 't.consumed');
    const { rows } = await this.db.query<{
      accounts: number;
      users: number;
      units_consumed: number;
      total_allowance: number;
      total_remaining: number;
      approaching: number;
      at_or_over: number;
    }>(
      `WITH t AS (
         SELECT pv.monthly_allowance AS allowance, COALESCE(c.consumed, 0) AS consumed
         FROM accounts a
         JOIN plans p ON p.id = a.plan_id
         JOIN plan_versions pv ON pv.id = p.current_version_id
         LEFT JOIN account_usage_counters c ON c.account_id = a.id AND c.period = $1
       )
       SELECT count(*) AS accounts,
              (SELECT count(*) FROM users) AS users,
              COALESCE(sum(t.consumed), 0) AS units_consumed,
              COALESCE(sum(t.allowance), 0) AS total_allowance,
              COALESCE(sum(GREATEST(t.allowance - t.consumed, 0)), 0) AS total_remaining,
              count(*) FILTER (WHERE ${status} = 'warning') AS approaching,
              count(*) FILTER (WHERE ${status} IN ('exhausted', 'over_allowance')) AS at_or_over
       FROM t`,
      [periodToDate(period)],
    );
    const row = rows[0];
    return {
      accounts: row?.accounts ?? 0,
      users: row?.users ?? 0,
      unitsConsumed: row?.units_consumed ?? 0,
      totalAllowance: row?.total_allowance ?? 0,
      totalRemaining: row?.total_remaining ?? 0,
      accountsApproachingLimit: row?.approaching ?? 0,
      accountsAtOrOverLimit: row?.at_or_over ?? 0,
    };
  }
}
