import type { AccountFacets, AdminSearchResult, QuotaStatus } from '../../contracts';
import type { AccountListFilter, AccountQuotaRow, AccountRepository } from '../../Application/Modules/Accounts/Interfaces/AccountRepository';
import type { PageWindow } from '../../Application/Common/Pagination/pagination';
import type { Account, AuthenticatedAccount } from '../../Domain/Accounts/Account';
import { periodToDate, type QuotaPeriod } from '../../Domain/Quotas/QuotaPeriod';
import type { Queryable } from '../Database/postgres';
import { PLAN_VERSION_COLUMNS, SqlParams, likePattern, prefixPattern, statusSql, toPlanVersionRow, utilizationSql, type PlanVersionColumns } from './sqlFragments';

interface AccountRowColumns {
  id: string;
  name: string;
  api_key_prefix: string;
  plan_id: string;
  created_at: Date;
}

interface AccountQuotaColumns extends PlanVersionColumns {
  id: string;
  name: string;
  api_key_prefix: string;
  created_at: Date;
  consumed: number;
  user_count: number;
  accepted_requests: number;
  rejected_requests: number;
  last_request_at: Date | null;
}

const toAccount = (row: AccountRowColumns): Account => ({
  id: row.id,
  name: row.name,
  apiKeyPrefix: row.api_key_prefix,
  planId: row.plan_id,
  createdAt: row.created_at,
});

const toQuotaRow = (row: AccountQuotaColumns): AccountQuotaRow => ({
  id: row.id,
  name: row.name,
  apiKeyPrefix: row.api_key_prefix,
  createdAt: row.created_at,
  plan: toPlanVersionRow(row),
  consumed: row.consumed,
  userCount: row.user_count,
  activity: { acceptedRequests: row.accepted_requests, rejectedRequests: row.rejected_requests, lastRequestAt: row.last_request_at },
});

/** Account + current plan version + consumption for the period ($1 = period date). */
const BASE_FROM = `
  FROM accounts a
  JOIN plans p ON p.id = a.plan_id
  JOIN plan_versions pv ON pv.id = p.current_version_id
  LEFT JOIN account_usage_counters c ON c.account_id = a.id AND c.period = $1`;

/** BASE_FROM + user count, request counts of the period and the latest request ever. */
const QUOTA_FROM = `${BASE_FROM}
  CROSS JOIN LATERAL (SELECT count(*) AS user_count FROM users u WHERE u.account_id = a.id) uc
  CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE r.outcome = 'accepted') AS accepted_requests,
           count(*) FILTER (WHERE r.outcome = 'rejected') AS rejected_requests
    FROM usage_records r WHERE r.account_id = a.id AND r.period = $1) act
  CROSS JOIN LATERAL (SELECT max(r.created_at) AS last_request_at FROM usage_records r WHERE r.account_id = a.id) lr`;

const QUOTA_SELECT = `
  SELECT a.id, a.name, a.api_key_prefix, a.created_at, ${PLAN_VERSION_COLUMNS},
         COALESCE(c.consumed, 0) AS consumed, uc.user_count,
         act.accepted_requests, act.rejected_requests, lr.last_request_at
  ${QUOTA_FROM}`;

const CONSUMED = 'COALESCE(c.consumed, 0)';
const UTILIZATION = utilizationSql('pv.monthly_allowance', CONSUMED);
const STATUS = statusSql('pv.monthly_allowance', CONSUMED);
const ACTIVE = '(act.accepted_requests + act.rejected_requests) > 0';
/** Same as ACTIVE, but usable on BASE_FROM (no lateral joins). */
const ACTIVE_EXISTS = 'EXISTS (SELECT 1 FROM usage_records r WHERE r.account_id = a.id AND r.period = $1)';

/** Whitelist: the client chooses a key, never raw SQL. */
const SORT_SQL: Record<AccountListFilter['sort'], string> = {
  name: 'lower(a.name)',
  createdAt: 'a.created_at',
  utilization: UTILIZATION,
  consumed: CONSUMED,
  userCount: 'uc.user_count',
  lastActivity: 'lr.last_request_at',
  rejected: 'act.rejected_requests',
};

/** Name, id, API key prefix, or the id / display name of one of the account's users. */
export function searchCondition(params: SqlParams, search: string): string {
  const pattern = params.add(likePattern(search));
  return `(a.name ILIKE ${pattern} OR a.id::text ILIKE ${pattern} OR a.api_key_prefix ILIKE ${pattern}
    OR EXISTS (SELECT 1 FROM users su WHERE su.account_id = a.id AND (su.external_user_id ILIKE ${pattern} OR su.display_name ILIKE ${pattern})))`;
}

export class PostgresAccountRepository implements AccountRepository {
  constructor(private readonly db: Queryable) {}

  async findByApiKeyHash(apiKeyHash: string): Promise<AuthenticatedAccount | null> {
    const { rows } = await this.db.query<{ id: string; name: string }>('SELECT id, name FROM accounts WHERE api_key_hash = $1', [apiKeyHash]);
    return rows[0] ?? null;
  }

  async findById(accountId: string): Promise<Account | null> {
    const { rows } = await this.db.query<AccountRowColumns>('SELECT id, name, api_key_prefix, plan_id, created_at FROM accounts WHERE id = $1', [accountId]);
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async create(input: { name: string; apiKeyHash: string; apiKeyPrefix: string; planId: string; createdAt: Date }): Promise<Account> {
    const { rows } = await this.db.query<AccountRowColumns>(
      `INSERT INTO accounts (name, api_key_hash, api_key_prefix, plan_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING id, name, api_key_prefix, plan_id, created_at`,
      [input.name, input.apiKeyHash, input.apiKeyPrefix, input.planId, input.createdAt],
    );
    return toAccount(rows[0]!);
  }

  async updatePlan(accountId: string, planId: string, updatedAt: Date): Promise<void> {
    await this.db.query('UPDATE accounts SET plan_id = $2, updated_at = $3 WHERE id = $1', [accountId, planId, updatedAt]);
  }

  async updateApiKey(accountId: string, apiKeyHash: string, apiKeyPrefix: string, updatedAt: Date): Promise<string> {
    const { rows } = await this.db.query<{ previous: string }>(
      `WITH old AS (SELECT api_key_hash FROM accounts WHERE id = $1 FOR UPDATE)
       UPDATE accounts a SET api_key_hash = $2, api_key_prefix = $3, updated_at = $4 FROM old WHERE a.id = $1
       RETURNING old.api_key_hash AS previous`,
      [accountId, apiKeyHash, apiKeyPrefix, updatedAt],
    );
    return rows[0]!.previous;
  }

  async getQuotaRow(accountId: string, period: QuotaPeriod): Promise<AccountQuotaRow | null> {
    const { rows } = await this.db.query<AccountQuotaColumns>(`${QUOTA_SELECT} WHERE a.id = $2`, [periodToDate(period), accountId]);
    return rows[0] ? toQuotaRow(rows[0]) : null;
  }

  async list(filter: AccountListFilter, window: PageWindow): Promise<{ rows: AccountQuotaRow[]; total: number }> {
    const params = new SqlParams();
    params.add(periodToDate(filter.period));
    const conditions: string[] = [];
    if (filter.search) conditions.push(searchCondition(params, filter.search));
    if (filter.status) conditions.push(`${STATUS} = ${params.add(filter.status)}`);
    if (filter.planId) conditions.push(`a.plan_id = ${params.add(filter.planId)}`);
    if (filter.planKind) conditions.push(`p.is_predefined = ${params.add(filter.planKind === 'predefined')}`);
    if (filter.minUtilization !== undefined) conditions.push(`${UTILIZATION} >= ${params.add(filter.minUtilization)}`);
    if (filter.maxUtilization !== undefined) conditions.push(`${UTILIZATION} <= ${params.add(filter.maxUtilization)}`);
    if (filter.createdFrom) conditions.push(`a.created_at >= ${params.add(filter.createdFrom)}::date`);
    if (filter.createdTo) conditions.push(`a.created_at < (${params.add(filter.createdTo)}::date + 1)`);
    if (filter.activity) conditions.push(filter.activity === 'active' ? ACTIVE : `NOT ${ACTIVE}`);
    if (filter.hasRejections !== undefined) conditions.push(filter.hasRejections ? 'act.rejected_requests > 0' : 'act.rejected_requests = 0');
    if (filter.minUsers !== undefined) conditions.push(`uc.user_count >= ${params.add(filter.minUsers)}`);
    if (filter.maxUsers !== undefined) conditions.push(`uc.user_count <= ${params.add(filter.maxUsers)}`);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const direction = filter.order === 'asc' ? 'ASC' : 'DESC';

    const countResult = await this.db.query<{ total: number }>(`SELECT count(*) AS total ${QUOTA_FROM} ${where}`, params.values);
    const limit = params.add(window.limit);
    const offset = params.add(window.offset);
    const { rows } = await this.db.query<AccountQuotaColumns>(
      `${QUOTA_SELECT} ${where} ORDER BY ${SORT_SQL[filter.sort]} ${direction} NULLS LAST, a.id ${direction} LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    return { rows: rows.map(toQuotaRow), total: countResult.rows[0]?.total ?? 0 };
  }

  async facets(filter: { period: QuotaPeriod; search?: string }): Promise<Omit<AccountFacets, 'period'>> {
    const params = new SqlParams();
    params.add(periodToDate(filter.period));
    const where = filter.search ? `WHERE ${searchCondition(params, filter.search)}` : '';
    const [totals, plans] = await Promise.all([
      this.db.query<FacetTotalsColumns>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE ${STATUS} = 'ok') AS ok,
                count(*) FILTER (WHERE ${STATUS} = 'warning') AS warning,
                count(*) FILTER (WHERE ${STATUS} = 'exhausted') AS exhausted,
                count(*) FILTER (WHERE ${STATUS} = 'over_allowance') AS over_allowance,
                count(*) FILTER (WHERE ${ACTIVE_EXISTS}) AS active
         ${BASE_FROM} ${where}`,
        params.values,
      ),
      this.db.query<PlanFacetColumns>(
        `SELECT p.id AS plan_id, p.name AS plan_name, p.is_predefined, o.name AS owner_account_name, count(*) AS count
         ${BASE_FROM} LEFT JOIN accounts o ON o.id = p.owner_account_id ${where}
         GROUP BY p.id, p.name, p.is_predefined, o.name
         ORDER BY p.is_predefined DESC, count(*) DESC, lower(p.name), p.id`,
        params.values,
      ),
    ]);
    return toFacets(totals.rows[0], plans.rows);
  }

  async quickSearch(query: string, limit: number): Promise<AdminSearchResult['accounts']> {
    // Exact id or key prefix first, then names that start with the text, then the rest.
    const { rows } = await this.db.query<{ id: string; name: string; api_key_prefix: string; plan_name: string; user_count: number }>(
      `SELECT a.id, a.name, a.api_key_prefix, p.name AS plan_name,
              (SELECT count(*) FROM users u WHERE u.account_id = a.id) AS user_count
       FROM accounts a JOIN plans p ON p.id = a.plan_id
       WHERE a.name ILIKE $1 OR a.id::text ILIKE $1 OR a.api_key_prefix ILIKE $1
       ORDER BY (a.id::text = $2 OR a.api_key_prefix = $2) DESC, (a.name ILIKE $3) DESC, lower(a.name), a.id
       LIMIT $4`,
      [likePattern(query), query.toLowerCase(), prefixPattern(query), limit],
    );
    return rows.map((row) => ({ id: row.id, name: row.name, apiKeyPrefix: row.api_key_prefix, planName: row.plan_name, userCount: row.user_count }));
  }
}

// ------------------------------------------------------------------ facet helpers (shared with users)

export interface PlanFacetColumns {
  plan_id: string;
  plan_name: string;
  is_predefined: boolean;
  owner_account_name: string | null;
  count: number;
}

export interface FacetTotalsColumns {
  total: number;
  ok: number;
  warning: number;
  exhausted: number;
  over_allowance: number;
  active: number;
}

export function toFacets(row: FacetTotalsColumns | undefined, plans: PlanFacetColumns[]): Omit<AccountFacets, 'period'> {
  const total = row?.total ?? 0;
  const active = row?.active ?? 0;
  const byStatus: Record<QuotaStatus, number> = { ok: row?.ok ?? 0, warning: row?.warning ?? 0, exhausted: row?.exhausted ?? 0, over_allowance: row?.over_allowance ?? 0 };
  return {
    total,
    byStatus,
    byPlan: plans.map((plan) => ({ planId: plan.plan_id, planName: plan.plan_name, isPredefined: plan.is_predefined, ownerAccountName: plan.owner_account_name, count: plan.count })),
    byActivity: { active, inactive: total - active },
  };
}
