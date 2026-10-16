import { randomUUID } from 'node:crypto';
import type { PlanScope } from '../../contracts';
import type { PageWindow } from '../../Application/Common/Pagination/pagination';
import type { AdminPlanRow, PlanListFilter, PlanRepository } from '../../Application/Modules/Plans/Interfaces/PlanRepository';
import type { PlanVersionRow } from '../../Application/Modules/Quotas/DTOs/quotaMapping';
import type { Plan } from '../../Domain/Plans/Plan';
import { planNameTaken } from '../../Domain/Plans/PlanErrors';
import type { PlanVersion } from '../../Domain/Plans/PlanVersion';
import type { QuotaLimits } from '../../Domain/Quotas/QuotaPolicy';
import { PG_ERROR, pgErrorCode, type Queryable } from '../Database/postgres';
import { PLAN_VERSION_COLUMNS, SqlParams, likePattern, toPlanVersionRow, type PlanVersionColumns } from './sqlFragments';

interface PlanColumns {
  id: string;
  name: string;
  description: string | null;
  scope: PlanScope;
  is_predefined: boolean;
  owner_account_id: string | null;
  created_at: Date;
  updated_at: Date;
  version_id: string;
  version: number;
  monthly_allowance: number;
  max_units_per_request: number;
  version_created_at: Date;
}

interface VersionColumns {
  id: string;
  plan_id: string;
  version: number;
  monthly_allowance: number;
  max_units_per_request: number;
  created_at: Date;
}

const PLAN_SELECT = `
  SELECT p.id, p.name, p.description, p.scope, p.is_predefined, p.owner_account_id, p.created_at, p.updated_at,
         pv.id AS version_id, pv.version, pv.monthly_allowance, pv.max_units_per_request, pv.created_at AS version_created_at
  FROM plans p
  JOIN plan_versions pv ON pv.id = p.current_version_id`;

const toPlan = (row: PlanColumns): Plan => ({
  id: row.id,
  name: row.name,
  description: row.description,
  scope: row.scope,
  isPredefined: row.is_predefined,
  ownerAccountId: row.owner_account_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  currentVersion: {
    id: row.version_id,
    planId: row.id,
    version: row.version,
    monthlyAllowance: row.monthly_allowance,
    maxUnitsPerRequest: row.max_units_per_request,
    createdAt: row.version_created_at,
  },
});

const toVersion = (row: VersionColumns): PlanVersion => ({
  id: row.id,
  planId: row.plan_id,
  version: row.version,
  monthlyAllowance: row.monthly_allowance,
  maxUnitsPerRequest: row.max_units_per_request,
  createdAt: row.created_at,
});

/** Shared WHERE for plan lists (aliases p = plans, pv = current version). */
function planWhere(filter: PlanListFilter, params: SqlParams, conditions: string[]): string {
  if (filter.search) {
    const pattern = params.add(likePattern(filter.search));
    conditions.push(`(p.name ILIKE ${pattern} OR p.description ILIKE ${pattern})`);
  }
  if (filter.scope) conditions.push(`p.scope = ${params.add(filter.scope)}`);
  if (filter.kind) conditions.push(`p.is_predefined = ${params.add(filter.kind === 'predefined')}`);
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

/** Whitelisted ORDER BY; the default lists predefined plans first. */
const PLAN_SORT_SQL: Record<NonNullable<PlanListFilter['sort']>, string> = {
  name: 'lower(p.name)',
  createdAt: 'p.created_at',
  monthlyAllowance: 'pv.monthly_allowance',
  maxUnitsPerRequest: 'pv.max_units_per_request',
};
function planOrder(filter: PlanListFilter): string {
  if (!filter.sort) return 'p.is_predefined DESC, p.scope ASC, lower(p.name) ASC, p.id ASC';
  const direction = filter.order === 'desc' ? 'DESC' : 'ASC';
  return `${PLAN_SORT_SQL[filter.sort]} ${direction}, p.id ${direction}`;
}

function rethrowNameConflict(error: unknown, name: string | undefined): never {
  if (pgErrorCode(error) === PG_ERROR.UNIQUE_VIOLATION && name) throw planNameTaken(name);
  throw error;
}

export class PostgresPlanRepository implements PlanRepository {
  constructor(private readonly db: Queryable) {}

  async findById(planId: string): Promise<Plan | null> {
    const { rows } = await this.db.query<PlanColumns>(`${PLAN_SELECT} WHERE p.id = $1`, [planId]);
    return rows[0] ? toPlan(rows[0]) : null;
  }

  async findByIdForUpdate(planId: string): Promise<Plan | null> {
    const { rows } = await this.db.query<PlanColumns>(`${PLAN_SELECT} WHERE p.id = $1 FOR UPDATE OF p`, [planId]);
    return rows[0] ? toPlan(rows[0]) : null;
  }

  async listVisible(accountId: string, filter: PlanListFilter, window: PageWindow): Promise<{ rows: Plan[]; total: number }> {
    const params = new SqlParams();
    const where = planWhere(filter, params, [`(p.is_predefined OR p.owner_account_id = ${params.add(accountId)})`]);
    const countResult = await this.db.query<{ total: number }>(`SELECT count(*) AS total FROM plans p JOIN plan_versions pv ON pv.id = p.current_version_id ${where}`, params.values);
    const limit = params.add(window.limit);
    const offset = params.add(window.offset);
    const { rows } = await this.db.query<PlanColumns>(`${PLAN_SELECT} ${where} ORDER BY ${planOrder(filter)} LIMIT ${limit} OFFSET ${offset}`, params.values);
    return { rows: rows.map(toPlan), total: countResult.rows[0]?.total ?? 0 };
  }

  async listAll(filter: PlanListFilter & { ownerAccountId?: string }, window: PageWindow): Promise<{ rows: AdminPlanRow[]; total: number }> {
    const params = new SqlParams();
    const extra = filter.ownerAccountId ? [`p.owner_account_id = ${params.add(filter.ownerAccountId)}`] : [];
    const where = planWhere(filter, params, extra);
    const countResult = await this.db.query<{ total: number }>(`SELECT count(*) AS total FROM plans p JOIN plan_versions pv ON pv.id = p.current_version_id ${where}`, params.values);
    const limit = params.add(window.limit);
    const offset = params.add(window.offset);
    const { rows } = await this.db.query<PlanColumns>(`${PLAN_SELECT} ${where} ORDER BY ${planOrder(filter)} LIMIT ${limit} OFFSET ${offset}`, params.values);
    // Owner names and assignment counts for just this page, keyed by plan id (keeps the page order).
    const extras = await this.db.query<{ id: string; owner_account_name: string | null; assigned_accounts: number; assigned_users: number }>(
      `SELECT p.id, o.name AS owner_account_name,
              (SELECT count(*) FROM accounts a WHERE a.plan_id = p.id) AS assigned_accounts,
              (SELECT count(*) FROM users u WHERE u.plan_id = p.id) AS assigned_users
       FROM plans p LEFT JOIN accounts o ON o.id = p.owner_account_id
       WHERE p.id = ANY($1::uuid[])`,
      [rows.map((row) => row.id)],
    );
    const byId = new Map(extras.rows.map((row) => [row.id, row]));
    return {
      rows: rows.map((row) => ({
        plan: toPlan(row),
        ownerAccountName: byId.get(row.id)?.owner_account_name ?? null,
        assignedAccounts: byId.get(row.id)?.assigned_accounts ?? 0,
        assignedUsers: byId.get(row.id)?.assigned_users ?? 0,
      })),
      total: countResult.rows[0]?.total ?? 0,
    };
  }


  async listVersions(planId: string): Promise<PlanVersion[]> {
    const { rows } = await this.db.query<VersionColumns>(
      'SELECT id, plan_id, version, monthly_allowance, max_units_per_request, created_at FROM plan_versions WHERE plan_id = $1 ORDER BY version DESC',
      [planId],
    );
    return rows.map(toVersion);
  }

  async countAssignments(planId: string, accountId: string): Promise<{ accounts: number; users: number }> {
    const { rows } = await this.db.query<{ accounts: number; users: number }>(
      `SELECT (SELECT count(*) FROM accounts WHERE id = $2 AND plan_id = $1) AS accounts,
              (SELECT count(*) FROM users WHERE account_id = $2 AND plan_id = $1) AS users`,
      [planId, accountId],
    );
    return rows[0] ?? { accounts: 0, users: 0 };
  }

  /** Plan + version 1 in one statement (the plan's FK to its version is deferred). */
  async create(input: { name: string; description: string | null; scope: PlanScope; ownerAccountId: string; limits: QuotaLimits; createdAt: Date }): Promise<Plan> {
    const planId = randomUUID();
    const versionId = randomUUID();
    try {
      await this.db.query(
        `WITH new_plan AS (
           INSERT INTO plans (id, name, description, scope, is_predefined, owner_account_id, current_version_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, false, $5, $6, $9, $9)
           RETURNING id
         )
         INSERT INTO plan_versions (id, plan_id, version, monthly_allowance, max_units_per_request, created_at)
         SELECT $6, id, 1, $7, $8, $9 FROM new_plan`,
        [planId, input.name, input.description, input.scope, input.ownerAccountId, versionId, input.limits.monthlyAllowance, input.limits.maxUnitsPerRequest, input.createdAt],
      );
    } catch (error) {
      rethrowNameConflict(error, input.name);
    }
    const plan = await this.findById(planId);
    if (!plan) throw new Error(`Plan ${planId} was not created`);
    return plan;
  }

  async update(planId: string, input: { name?: string; description?: string | null; limits: QuotaLimits | null; updatedAt: Date }): Promise<void> {
    try {
      if (input.limits) {
        const versionId = randomUUID();
        await this.db.query(
          `INSERT INTO plan_versions (id, plan_id, version, monthly_allowance, max_units_per_request, created_at)
           SELECT $1, $2, COALESCE(max(version), 0) + 1, $3, $4, $5 FROM plan_versions WHERE plan_id = $2`,
          [versionId, planId, input.limits.monthlyAllowance, input.limits.maxUnitsPerRequest, input.updatedAt],
        );
        await this.db.query('UPDATE plans SET current_version_id = $2 WHERE id = $1', [planId, versionId]);
      }
      await this.db.query(
        `UPDATE plans SET
           name = COALESCE($2, name),
           description = CASE WHEN $3::boolean THEN $4 ELSE description END,
           updated_at = $5
         WHERE id = $1`,
        [planId, input.name ?? null, input.description !== undefined, input.description ?? null, input.updatedAt],
      );
    } catch (error) {
      rethrowNameConflict(error, input.name);
    }
  }

  async currentVersions(accountId: string, userId: string): Promise<{ account: PlanVersionRow; user: PlanVersionRow }> {
    const { rows } = await this.db.query<PlanVersionColumns & { level: 'account' | 'user' }>(
      `SELECT 'account' AS level, ${PLAN_VERSION_COLUMNS}
       FROM accounts a JOIN plans p ON p.id = a.plan_id JOIN plan_versions pv ON pv.id = p.current_version_id
       WHERE a.id = $1
       UNION ALL
       SELECT 'user' AS level, ${PLAN_VERSION_COLUMNS}
       FROM users u JOIN plans p ON p.id = u.plan_id JOIN plan_versions pv ON pv.id = p.current_version_id
       WHERE u.id = $2`,
      [accountId, userId],
    );
    const account = rows.find((row) => row.level === 'account');
    const user = rows.find((row) => row.level === 'user');
    if (!account || !user) throw new Error(`Plan versions missing for account ${accountId} / user ${userId}`);
    return { account: toPlanVersionRow(account), user: toPlanVersionRow(user) };
  }

  async versionRowsByIds(versionIds: string[]): Promise<Map<string, PlanVersionRow>> {
    const { rows } = await this.db.query<PlanVersionColumns>(
      `SELECT ${PLAN_VERSION_COLUMNS} FROM plan_versions pv JOIN plans p ON p.id = pv.plan_id WHERE pv.id = ANY($1::uuid[])`,
      [versionIds],
    );
    return new Map(rows.map((row) => [row.plan_version_id, toPlanVersionRow(row)]));
  }
}
