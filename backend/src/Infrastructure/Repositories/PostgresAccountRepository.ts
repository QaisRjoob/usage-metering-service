import type { AccountListFilter, AccountQuotaRow, AccountRepository } from '../../Application/Modules/Accounts/Interfaces/AccountRepository';
import type { PageWindow } from '../../Application/Common/Pagination/pagination';
import type { Account, AuthenticatedAccount } from '../../Domain/Accounts/Account';
import { periodToDate, type QuotaPeriod } from '../../Domain/Quotas/QuotaPeriod';
import type { Queryable } from '../Database/postgres';
import { PLAN_VERSION_COLUMNS, SqlParams, likePattern, statusSql, toPlanVersionRow, utilizationSql, type PlanVersionColumns } from './sqlFragments';

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
});

/** Account + current plan version + consumption for the period ($1 = period date). */
const QUOTA_FROM = `
  FROM accounts a
  JOIN plans p ON p.id = a.plan_id
  JOIN plan_versions pv ON pv.id = p.current_version_id
  LEFT JOIN account_usage_counters c ON c.account_id = a.id AND c.period = $1`;

const QUOTA_SELECT = `
  SELECT a.id, a.name, a.api_key_prefix, a.created_at, ${PLAN_VERSION_COLUMNS},
         COALESCE(c.consumed, 0) AS consumed,
         (SELECT count(*) FROM users u WHERE u.account_id = a.id) AS user_count
  ${QUOTA_FROM}`;

const CONSUMED = 'COALESCE(c.consumed, 0)';
const UTILIZATION = utilizationSql('pv.monthly_allowance', CONSUMED);

/** Whitelist: the client chooses a key, never raw SQL. */
const SORT_SQL: Record<AccountListFilter['sort'], string> = {
  name: 'lower(a.name)',
  createdAt: 'a.created_at',
  utilization: UTILIZATION,
  consumed: CONSUMED,
  userCount: '(SELECT count(*) FROM users u WHERE u.account_id = a.id)',
};

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

  async getQuotaRow(accountId: string, period: QuotaPeriod): Promise<AccountQuotaRow | null> {
    const { rows } = await this.db.query<AccountQuotaColumns>(`${QUOTA_SELECT} WHERE a.id = $2`, [periodToDate(period), accountId]);
    return rows[0] ? toQuotaRow(rows[0]) : null;
  }

  async list(filter: AccountListFilter, window: PageWindow): Promise<{ rows: AccountQuotaRow[]; total: number }> {
    const params = new SqlParams();
    params.add(periodToDate(filter.period));
    const conditions: string[] = [];
    if (filter.search) {
      const pattern = params.add(likePattern(filter.search));
      conditions.push(`(a.name ILIKE ${pattern} OR a.id::text ILIKE ${pattern})`);
    }
    if (filter.status) conditions.push(`${statusSql('pv.monthly_allowance', CONSUMED)} = ${params.add(filter.status)}`);
    if (filter.planId) conditions.push(`a.plan_id = ${params.add(filter.planId)}`);
    if (filter.planKind) conditions.push(`p.is_predefined = ${params.add(filter.planKind === 'predefined')}`);
    if (filter.minUtilization !== undefined) conditions.push(`${UTILIZATION} >= ${params.add(filter.minUtilization)}`);
    if (filter.maxUtilization !== undefined) conditions.push(`${UTILIZATION} <= ${params.add(filter.maxUtilization)}`);
    if (filter.createdFrom) conditions.push(`a.created_at >= ${params.add(filter.createdFrom)}::date`);
    if (filter.createdTo) conditions.push(`a.created_at < (${params.add(filter.createdTo)}::date + 1)`);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const direction = filter.order === 'asc' ? 'ASC' : 'DESC';

    const countResult = await this.db.query<{ total: number }>(`SELECT count(*) AS total ${QUOTA_FROM} ${where}`, params.values);
    const limit = params.add(window.limit);
    const offset = params.add(window.offset);
    const { rows } = await this.db.query<AccountQuotaColumns>(
      `${QUOTA_SELECT} ${where} ORDER BY ${SORT_SQL[filter.sort]} ${direction}, a.id ${direction} LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    return { rows: rows.map(toQuotaRow), total: countResult.rows[0]?.total ?? 0 };
  }
}
