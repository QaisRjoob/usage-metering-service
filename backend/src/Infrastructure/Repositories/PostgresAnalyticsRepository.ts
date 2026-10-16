import type { CompanyStatsTotals } from '../../contracts';
import type { PageWindow } from '../../Application/Common/Pagination/pagination';
import type { AccountTotals, AnalyticsRepository, CompanyStatsFilter, CompanyStatsRowData } from '../../Application/Modules/Usage/Interfaces/AnalyticsRepository';
import { periodToDate, type QuotaPeriod } from '../../Domain/Quotas/QuotaPeriod';
import type { Queryable } from '../Database/postgres';
import { searchCondition } from './PostgresAccountRepository';
import { PLAN_VERSION_COLUMNS, SqlParams, statusSql, toPlanVersionRow, utilizationSql, type PlanVersionColumns } from './sqlFragments';

interface CompanyStatsColumns extends PlanVersionColumns {
  id: string;
  name: string;
  api_key_prefix: string;
  created_at: Date;
  is_predefined: boolean;
  consumed: number;
  users: number;
  active_users: number;
  accepted: number;
  rejected: number;
  units_rejected: number;
  last_request_at: Date | null;
}

const CONSUMED = 'COALESCE(c.consumed, 0)';
const REJECTION_RATE = 'CASE WHEN act.accepted + act.rejected = 0 THEN 0 ELSE round(act.rejected * 100.0 / (act.accepted + act.rejected), 1) END';

/** Whitelisted sort keys of the company statistics. */
const COMPANY_SORT_SQL: Record<CompanyStatsFilter['sort'], string> = {
  name: 'lower(a.name)',
  consumed: CONSUMED,
  utilization: utilizationSql('pv.monthly_allowance', CONSUMED),
  accepted: 'act.accepted',
  rejected: 'act.rejected',
  rejectionRate: REJECTION_RATE,
  users: 'uc.users',
  activeUsers: 'act.active_users',
  lastActivity: 'lr.last_request_at',
};

/** Every account with its plan, counters and request aggregates for the period ($1). */
const COMPANY_FROM = `
  FROM accounts a
  JOIN plans p ON p.id = a.plan_id
  JOIN plan_versions pv ON pv.id = p.current_version_id
  LEFT JOIN account_usage_counters c ON c.account_id = a.id AND c.period = $1
  CROSS JOIN LATERAL (SELECT count(*) AS users FROM users u WHERE u.account_id = a.id) uc
  CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE r.outcome = 'accepted') AS accepted,
           count(*) FILTER (WHERE r.outcome = 'rejected') AS rejected,
           COALESCE(sum(r.units_requested) FILTER (WHERE r.outcome = 'rejected'), 0) AS units_rejected,
           count(DISTINCT r.user_id) AS active_users
    FROM usage_records r WHERE r.account_id = a.id AND r.period = $1) act
  CROSS JOIN LATERAL (SELECT max(r.created_at) AS last_request_at FROM usage_records r WHERE r.account_id = a.id) lr`;

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

  async companyStats(filter: CompanyStatsFilter, window: PageWindow): Promise<{ rows: CompanyStatsRowData[]; total: number; totals: CompanyStatsTotals; allUnitsConsumed: number }> {
    const params = new SqlParams();
    params.add(periodToDate(filter.period));
    const conditions: string[] = [];
    if (filter.search) conditions.push(searchCondition(params, filter.search));
    if (filter.status) conditions.push(`${statusSql('pv.monthly_allowance', CONSUMED)} = ${params.add(filter.status)}`);
    if (filter.planId) conditions.push(`a.plan_id = ${params.add(filter.planId)}`);
    if (filter.activity) conditions.push(`${filter.activity === 'active' ? '' : 'NOT '}(act.accepted + act.rejected) > 0`);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const direction = filter.order === 'asc' ? 'ASC' : 'DESC';

    const [totalsResult, allResult] = await Promise.all([
      this.db.query<{ companies: number; active_companies: number; users: number; active_users: number; units: number; allowance: number; accepted: number; rejected: number; units_rejected: number }>(
        `SELECT count(*) AS companies,
                count(*) FILTER (WHERE act.accepted + act.rejected > 0) AS active_companies,
                COALESCE(sum(uc.users), 0) AS users,
                COALESCE(sum(act.active_users), 0) AS active_users,
                COALESCE(sum(${CONSUMED}), 0) AS units,
                COALESCE(sum(pv.monthly_allowance), 0) AS allowance,
                COALESCE(sum(act.accepted), 0) AS accepted,
                COALESCE(sum(act.rejected), 0) AS rejected,
                COALESCE(sum(act.units_rejected), 0) AS units_rejected
         ${COMPANY_FROM} ${where}`,
        params.values,
      ),
      this.db.query<{ units: number }>('SELECT COALESCE(sum(consumed), 0) AS units FROM account_usage_counters WHERE period = $1', [params.values[0]]),
    ]);
    const limit = params.add(window.limit);
    const offset = params.add(window.offset);
    const { rows } = await this.db.query<CompanyStatsColumns>(
      `SELECT a.id, a.name, a.api_key_prefix, a.created_at, ${PLAN_VERSION_COLUMNS}, p.is_predefined,
              ${CONSUMED} AS consumed, uc.users, act.active_users, act.accepted, act.rejected, act.units_rejected, lr.last_request_at
       ${COMPANY_FROM} ${where}
       ORDER BY ${COMPANY_SORT_SQL[filter.sort]} ${direction} NULLS LAST, a.id ${direction}
       LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    const totals = totalsResult.rows[0];
    return {
      rows: rows.map((row) => ({
        id: row.id,
        name: row.name,
        apiKeyPrefix: row.api_key_prefix,
        createdAt: row.created_at,
        plan: toPlanVersionRow(row),
        isPredefined: row.is_predefined,
        consumed: row.consumed,
        users: row.users,
        activeUsers: row.active_users,
        accepted: row.accepted,
        rejected: row.rejected,
        unitsRejected: row.units_rejected,
        lastRequestAt: row.last_request_at,
      })),
      total: totals?.companies ?? 0,
      totals: {
        companies: totals?.companies ?? 0,
        activeCompanies: totals?.active_companies ?? 0,
        users: totals?.users ?? 0,
        activeUsers: totals?.active_users ?? 0,
        unitsConsumed: totals?.units ?? 0,
        totalAllowance: totals?.allowance ?? 0,
        acceptedRequests: totals?.accepted ?? 0,
        rejectedRequests: totals?.rejected ?? 0,
        unitsRejected: totals?.units_rejected ?? 0,
      },
      allUnitsConsumed: allResult.rows[0]?.units ?? 0,
    };
  }
}
