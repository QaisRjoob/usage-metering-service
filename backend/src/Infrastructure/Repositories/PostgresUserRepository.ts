import type { PageWindow } from '../../Application/Common/Pagination/pagination';
import type { UserListFilter, UserQuotaRow, UserRepository } from '../../Application/Modules/Users/Interfaces/UserRepository';
import { periodToDate, type QuotaPeriod } from '../../Domain/Quotas/QuotaPeriod';
import { userAlreadyExists, type UsageSubject } from '../../Domain/Users/UsageSubject';
import { PG_ERROR, pgErrorCode, type Queryable } from '../Database/postgres';
import { PLAN_VERSION_COLUMNS, SqlParams, likePattern, statusSql, toPlanVersionRow, utilizationSql, type PlanVersionColumns } from './sqlFragments';

interface UserColumns {
  id: string;
  account_id: string;
  external_user_id: string;
  display_name: string | null;
  plan_id: string;
  created_at: Date;
}

interface UserQuotaColumns extends PlanVersionColumns {
  id: string;
  external_user_id: string;
  display_name: string | null;
  created_at: Date;
  consumed: number;
}

const toSubject = (row: UserColumns): UsageSubject => ({
  id: row.id,
  accountId: row.account_id,
  externalUserId: row.external_user_id,
  displayName: row.display_name,
  planId: row.plan_id,
  createdAt: row.created_at,
});

const toQuotaRow = (row: UserQuotaColumns): UserQuotaRow => ({
  id: row.id,
  externalUserId: row.external_user_id,
  displayName: row.display_name,
  createdAt: row.created_at,
  plan: toPlanVersionRow(row),
  consumed: row.consumed,
});

/** User + current plan version + consumption ($1 = period date, $2 = account id). */
const QUOTA_FROM = `
  FROM users u
  JOIN plans p ON p.id = u.plan_id
  JOIN plan_versions pv ON pv.id = p.current_version_id
  LEFT JOIN user_usage_counters c ON c.user_id = u.id AND c.period = $1
  WHERE u.account_id = $2`;

const QUOTA_SELECT = `
  SELECT u.id, u.external_user_id, u.display_name, u.created_at, ${PLAN_VERSION_COLUMNS},
         COALESCE(c.consumed, 0) AS consumed
  ${QUOTA_FROM}`;

const CONSUMED = 'COALESCE(c.consumed, 0)';
const UTILIZATION = utilizationSql('pv.monthly_allowance', CONSUMED);

/** Whitelisted sort keys -> SQL. */
const SORT_SQL: Record<NonNullable<UserListFilter['sort']>, string> = {
  externalUserId: 'u.external_user_id',
  createdAt: 'u.created_at',
  utilization: UTILIZATION,
  consumed: CONSUMED,
};

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: Queryable) {}

  async findByExternalId(accountId: string, externalUserId: string): Promise<UsageSubject | null> {
    const { rows } = await this.db.query<UserColumns>(
      'SELECT id, account_id, external_user_id, display_name, plan_id, created_at FROM users WHERE account_id = $1 AND external_user_id = $2',
      [accountId, externalUserId],
    );
    return rows[0] ? toSubject(rows[0]) : null;
  }

  async create(input: { accountId: string; externalUserId: string; displayName: string | null; planId: string; createdAt: Date }): Promise<UsageSubject> {
    try {
      const { rows } = await this.db.query<UserColumns>(
        `INSERT INTO users (account_id, external_user_id, display_name, plan_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING id, account_id, external_user_id, display_name, plan_id, created_at`,
        [input.accountId, input.externalUserId, input.displayName, input.planId, input.createdAt],
      );
      return toSubject(rows[0]!);
    } catch (error) {
      if (pgErrorCode(error) === PG_ERROR.UNIQUE_VIOLATION) throw userAlreadyExists(input.externalUserId);
      throw error;
    }
  }

  async updatePlan(userId: string, planId: string, updatedAt: Date): Promise<void> {
    await this.db.query('UPDATE users SET plan_id = $2, updated_at = $3 WHERE id = $1', [userId, planId, updatedAt]);
  }

  async getQuotaRow(accountId: string, externalUserId: string, period: QuotaPeriod): Promise<UserQuotaRow | null> {
    const { rows } = await this.db.query<UserQuotaColumns>(`${QUOTA_SELECT} AND u.external_user_id = $3`, [periodToDate(period), accountId, externalUserId]);
    return rows[0] ? toQuotaRow(rows[0]) : null;
  }

  async list(accountId: string, filter: UserListFilter, window: PageWindow): Promise<{ rows: UserQuotaRow[]; total: number }> {
    const params = new SqlParams();
    params.add(periodToDate(filter.period));
    params.add(accountId);
    const conditions: string[] = [];
    if (filter.search) {
      const pattern = params.add(likePattern(filter.search));
      conditions.push(`(u.external_user_id ILIKE ${pattern} OR u.display_name ILIKE ${pattern})`);
    }
    if (filter.planId) conditions.push(`u.plan_id = ${params.add(filter.planId)}`);
    if (filter.status) conditions.push(`${statusSql('pv.monthly_allowance', CONSUMED)} = ${params.add(filter.status)}`);
    if (filter.minUtilization !== undefined) conditions.push(`${UTILIZATION} >= ${params.add(filter.minUtilization)}`);
    if (filter.maxUtilization !== undefined) conditions.push(`${UTILIZATION} <= ${params.add(filter.maxUtilization)}`);
    const extra = conditions.map((condition) => ` AND ${condition}`).join('');
    const direction = filter.order === 'desc' ? 'DESC' : 'ASC';

    const countResult = await this.db.query<{ total: number }>(`SELECT count(*) AS total ${QUOTA_FROM}${extra}`, params.values);
    const limit = params.add(window.limit);
    const offset = params.add(window.offset);
    const { rows } = await this.db.query<UserQuotaColumns>(
      `${QUOTA_SELECT}${extra} ORDER BY ${SORT_SQL[filter.sort ?? 'externalUserId']} ${direction}, u.id ${direction} LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    return { rows: rows.map(toQuotaRow), total: countResult.rows[0]?.total ?? 0 };
  }

  async topByUtilization(accountId: string, period: QuotaPeriod, limit: number): Promise<UserQuotaRow[]> {
    const { rows } = await this.db.query<UserQuotaColumns>(
      `${QUOTA_SELECT} ORDER BY ${UTILIZATION} DESC, u.id ASC LIMIT $3`,
      [periodToDate(period), accountId, limit],
    );
    return rows.map(toQuotaRow);
  }

  async statusCounts(accountId: string, period: QuotaPeriod): Promise<{ total: number; approachingLimit: number; atOrOverLimit: number }> {
    const status = statusSql('pv.monthly_allowance', CONSUMED);
    const { rows } = await this.db.query<{ total: number; approaching: number; at_or_over: number }>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE ${status} = 'warning') AS approaching,
              count(*) FILTER (WHERE ${status} IN ('exhausted', 'over_allowance')) AS at_or_over
       ${QUOTA_FROM}`,
      [periodToDate(period), accountId],
    );
    const row = rows[0];
    return { total: row?.total ?? 0, approachingLimit: row?.approaching ?? 0, atOrOverLimit: row?.at_or_over ?? 0 };
  }
}
