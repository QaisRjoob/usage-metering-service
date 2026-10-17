import type { PageWindow } from '../../Application/Common/Pagination/pagination';
import type { AdminSearchResult, UserFacets } from '../../contracts';
import type { DirectoryUserFilter, DirectoryUserRow, UserListFilter, UserListRow, UserQuotaRow, UserRepository } from '../../Application/Modules/Users/Interfaces/UserRepository';
import { periodToDate, type QuotaPeriod } from '../../Domain/Quotas/QuotaPeriod';
import { userAlreadyExists, type UsageSubject } from '../../Domain/Users/UsageSubject';
import { PG_ERROR, pgErrorCode, type Queryable } from '../Database/postgres';
import { toFacets, type FacetTotalsColumns, type PlanFacetColumns } from './PostgresAccountRepository';
import { PLAN_VERSION_COLUMNS, SqlParams, likePattern, prefixPattern, statusSql, toPlanVersionRow, utilizationSql, type PlanVersionColumns } from './sqlFragments';

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

/** Users of every account ($1 = period date). DIRECTORY_BASE has no lateral joins (for counts). */
const DIRECTORY_BASE = `
  FROM users u
  JOIN accounts a ON a.id = u.account_id
  JOIN plans p ON p.id = u.plan_id
  JOIN plan_versions pv ON pv.id = p.current_version_id
  LEFT JOIN user_usage_counters c ON c.user_id = u.id AND c.period = $1`;

const DIRECTORY_FROM = `${DIRECTORY_BASE}
  CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE r.outcome = 'accepted') AS accepted_requests,
           count(*) FILTER (WHERE r.outcome = 'rejected') AS rejected_requests
    FROM usage_records r WHERE r.user_id = u.id AND r.period = $1) act
  CROSS JOIN LATERAL (SELECT max(r.created_at) AS last_request_at FROM usage_records r WHERE r.user_id = u.id) lr`;

const DIRECTORY_SELECT = `
  SELECT u.id, u.external_user_id, u.display_name, u.created_at, ${PLAN_VERSION_COLUMNS},
         COALESCE(c.consumed, 0) AS consumed, a.id AS account_id, a.name AS account_name,
         act.accepted_requests, act.rejected_requests, lr.last_request_at
  ${DIRECTORY_FROM}`;

interface DirectoryColumns extends UserQuotaColumns {
  account_id: string;
  account_name: string;
  accepted_requests: number;
  rejected_requests: number;
  last_request_at: Date | null;
}

const CONSUMED = 'COALESCE(c.consumed, 0)';
const UTILIZATION = utilizationSql('pv.monthly_allowance', CONSUMED);

const STATUS = statusSql('pv.monthly_allowance', CONSUMED);

/** Whitelisted sort keys -> SQL (one company's list uses a subset of the directory's keys). */
const DIRECTORY_SORT_SQL: Record<DirectoryUserFilter['sort'], string> = {
  externalUserId: 'u.external_user_id',
  createdAt: 'u.created_at',
  utilization: UTILIZATION,
  consumed: CONSUMED,
  accountName: 'lower(a.name)',
  lastActivity: 'lr.last_request_at',
  rejected: 'act.rejected_requests',
};

/** Search + company filters shared by the directory list and its facets. */
function directoryScope(params: SqlParams, filter: { search?: string; accountId?: string }): string[] {
  const conditions: string[] = [];
  if (filter.search) {
    const pattern = params.add(likePattern(filter.search));
    conditions.push(`(u.external_user_id ILIKE ${pattern} OR u.display_name ILIKE ${pattern} OR u.id::text ILIKE ${pattern})`);
  }
  if (filter.accountId) conditions.push(`u.account_id = ${params.add(filter.accountId)}`);
  return conditions;
}

const whereOf = (conditions: string[]) => (conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '');

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

  async list(accountId: string, filter: UserListFilter, window: PageWindow): Promise<{ rows: UserListRow[]; total: number }> {
    const params = new SqlParams();
    params.add(periodToDate(filter.period));
    // Search here matches the user id and display name only (the caller knows its own users).
    const conditions = [`u.account_id = ${params.add(accountId)}`];
    if (filter.search) {
      const pattern = params.add(likePattern(filter.search));
      conditions.push(`(u.external_user_id ILIKE ${pattern} OR u.display_name ILIKE ${pattern})`);
    }
    if (filter.planId) conditions.push(`u.plan_id = ${params.add(filter.planId)}`);
    if (filter.status) conditions.push(`${STATUS} = ${params.add(filter.status)}`);
    if (filter.minUtilization !== undefined) conditions.push(`${UTILIZATION} >= ${params.add(filter.minUtilization)}`);
    if (filter.maxUtilization !== undefined) conditions.push(`${UTILIZATION} <= ${params.add(filter.maxUtilization)}`);
    if (filter.activity) conditions.push(`${filter.activity === 'active' ? '' : 'NOT '}(act.accepted_requests + act.rejected_requests) > 0`);
    if (filter.hasRejections !== undefined) conditions.push(filter.hasRejections ? 'act.rejected_requests > 0' : 'act.rejected_requests = 0');
    if (filter.createdFrom) conditions.push(`u.created_at >= ${params.add(filter.createdFrom)}::date`);
    if (filter.createdTo) conditions.push(`u.created_at < (${params.add(filter.createdTo)}::date + 1)`);
    const where = whereOf(conditions);
    const direction = filter.order === 'desc' ? 'DESC' : 'ASC';

    const countResult = await this.db.query<{ total: number }>(`SELECT count(*) AS total ${DIRECTORY_FROM} ${where}`, params.values);
    const limit = params.add(window.limit);
    const offset = params.add(window.offset);
    const { rows } = await this.db.query<DirectoryColumns>(
      `${DIRECTORY_SELECT} ${where} ORDER BY ${DIRECTORY_SORT_SQL[filter.sort ?? 'externalUserId']} ${direction} NULLS LAST, u.id ${direction} LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    return {
      rows: rows.map((row) => ({
        ...toQuotaRow(row),
        activity: { acceptedRequests: row.accepted_requests, rejectedRequests: row.rejected_requests, lastRequestAt: row.last_request_at },
      })),
      total: countResult.rows[0]?.total ?? 0,
    };
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

  async listDirectory(filter: DirectoryUserFilter, window: PageWindow): Promise<{ rows: DirectoryUserRow[]; total: number }> {
    const params = new SqlParams();
    params.add(periodToDate(filter.period));
    const conditions = directoryScope(params, filter);
    if (filter.planId) conditions.push(`u.plan_id = ${params.add(filter.planId)}`);
    if (filter.status) conditions.push(`${STATUS} = ${params.add(filter.status)}`);
    if (filter.minUtilization !== undefined) conditions.push(`${UTILIZATION} >= ${params.add(filter.minUtilization)}`);
    if (filter.maxUtilization !== undefined) conditions.push(`${UTILIZATION} <= ${params.add(filter.maxUtilization)}`);
    if (filter.activity) conditions.push(`${filter.activity === 'active' ? '' : 'NOT '}(act.accepted_requests + act.rejected_requests) > 0`);
    if (filter.createdFrom) conditions.push(`u.created_at >= ${params.add(filter.createdFrom)}::date`);
    if (filter.createdTo) conditions.push(`u.created_at < (${params.add(filter.createdTo)}::date + 1)`);
    const where = whereOf(conditions);
    const direction = filter.order === 'asc' ? 'ASC' : 'DESC';

    const countResult = await this.db.query<{ total: number }>(`SELECT count(*) AS total ${DIRECTORY_FROM} ${where}`, params.values);
    const limit = params.add(window.limit);
    const offset = params.add(window.offset);
    const { rows } = await this.db.query<DirectoryColumns>(
      `${DIRECTORY_SELECT} ${where} ORDER BY ${DIRECTORY_SORT_SQL[filter.sort]} ${direction} NULLS LAST, u.id ${direction} LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    return {
      rows: rows.map((row) => ({
        ...toQuotaRow(row),
        accountId: row.account_id,
        accountName: row.account_name,
        activity: { acceptedRequests: row.accepted_requests, rejectedRequests: row.rejected_requests, lastRequestAt: row.last_request_at },
      })),
      total: countResult.rows[0]?.total ?? 0,
    };
  }

  async directoryFacets(filter: { period: QuotaPeriod; search?: string; accountId?: string }): Promise<Omit<UserFacets, 'period'>> {
    const params = new SqlParams();
    params.add(periodToDate(filter.period));
    const where = whereOf(directoryScope(params, filter));
    const [totals, plans] = await Promise.all([
      this.db.query<FacetTotalsColumns>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE ${STATUS} = 'ok') AS ok,
                count(*) FILTER (WHERE ${STATUS} = 'warning') AS warning,
                count(*) FILTER (WHERE ${STATUS} = 'exhausted') AS exhausted,
                count(*) FILTER (WHERE ${STATUS} = 'over_allowance') AS over_allowance,
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM usage_records r WHERE r.user_id = u.id AND r.period = $1)) AS active
         ${DIRECTORY_BASE} ${where}`,
        params.values,
      ),
      this.db.query<PlanFacetColumns>(
        `SELECT p.id AS plan_id, p.name AS plan_name, p.is_predefined, o.name AS owner_account_name, count(*) AS count
         ${DIRECTORY_BASE} LEFT JOIN accounts o ON o.id = p.owner_account_id ${where}
         GROUP BY p.id, p.name, p.is_predefined, o.name
         ORDER BY p.is_predefined DESC, count(*) DESC, lower(p.name), p.id`,
        params.values,
      ),
    ]);
    return toFacets(totals.rows[0], plans.rows);
  }

  async quickSearch(query: string, limit: number): Promise<AdminSearchResult['users']> {
    // Exact user id first, then ids / names that start with the text, then the rest.
    const { rows } = await this.db.query<{ id: string; external_user_id: string; display_name: string | null; account_id: string; account_name: string }>(
      `SELECT u.id, u.external_user_id, u.display_name, a.id AS account_id, a.name AS account_name
       FROM users u JOIN accounts a ON a.id = u.account_id
       WHERE u.external_user_id ILIKE $1 OR u.display_name ILIKE $1 OR u.id::text ILIKE $1
       ORDER BY (lower(u.external_user_id) = $2 OR u.id::text = $2) DESC,
                (u.external_user_id ILIKE $3 OR u.display_name ILIKE $3) DESC,
                u.external_user_id, a.name, u.id
       LIMIT $4`,
      [likePattern(query), query.toLowerCase(), prefixPattern(query), limit],
    );
    return rows.map((row) => ({ id: row.id, externalUserId: row.external_user_id, displayName: row.display_name, accountId: row.account_id, accountName: row.account_name }));
  }
}
