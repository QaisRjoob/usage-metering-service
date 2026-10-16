import type {
  DailyUsagePoint,
  MonthlyUsagePoint,
  RejectionBreakdownItem,
  RequestCounts,
  RuleCode,
  RuleLevel,
  RuleViolation,
  UsageOutcome,
  UsageRecord as UsageRecordDto,
} from '../../contracts';
import type { PageWindow } from '../../Application/Common/Pagination/pagination';
import type { UsageFilter, UsageRepository, UsageSort } from '../../Application/Modules/Usage/Interfaces/UsageRepository';
import { periodFromDate, periodToDate, type QuotaPeriod } from '../../Domain/Quotas/QuotaPeriod';
import type { UsageRecord } from '../../Domain/Usage/UsageRecord';
import type { Queryable } from '../Database/postgres';
import { SqlParams, likePattern } from './sqlFragments';

interface RecordColumns {
  id: string;
  account_id: string;
  user_id: string;
  external_user_id: string;
  request_id: string;
  units_requested: number;
  outcome: UsageOutcome;
  rejection_rule: RuleCode | null;
  rejection_level: RuleLevel | null;
  violations: RuleViolation[];
  account_plan_version_id: string;
  user_plan_version_id: string;
  account_consumed_after: number;
  user_consumed_after: number;
  period: string;
  created_at: Date;
  correlation_id: string | null;
  replay_count: number;
}

interface ViewColumns extends RecordColumns {
  account_name: string;
  account_plan_id: string;
  account_plan_name: string;
  account_plan_version: number;
  user_plan_id: string;
  user_plan_name: string;
  user_plan_version: number;
}

/** Display columns for records of `source` (a table or a CTE aliased r). */
const viewSelect = (source: string) => `
  SELECT r.id, r.account_id, a.name AS account_name, r.user_id, u.external_user_id, r.request_id,
         r.units_requested, r.outcome, r.rejection_rule, r.rejection_level, r.violations,
         r.account_plan_version_id, apv.version AS account_plan_version, ap.id AS account_plan_id, ap.name AS account_plan_name,
         r.user_plan_version_id, upv.version AS user_plan_version, up.id AS user_plan_id, up.name AS user_plan_name,
         r.account_consumed_after, r.user_consumed_after, r.period, r.created_at, r.correlation_id, r.replay_count
  FROM ${source} r
  JOIN accounts a ON a.id = r.account_id
  JOIN users u ON u.id = r.user_id
  JOIN plan_versions apv ON apv.id = r.account_plan_version_id
  JOIN plans ap ON ap.id = apv.plan_id
  JOIN plan_versions upv ON upv.id = r.user_plan_version_id
  JOIN plans up ON up.id = upv.plan_id`;
const VIEW_SELECT = viewSelect('usage_records');

const toRecord = (row: RecordColumns): UsageRecord => ({
  id: row.id,
  accountId: row.account_id,
  userId: row.user_id,
  externalUserId: row.external_user_id,
  requestId: row.request_id,
  unitsRequested: row.units_requested,
  outcome: row.outcome,
  rejectionRule: row.rejection_rule,
  rejectionLevel: row.rejection_level,
  violations: row.violations,
  accountPlanVersionId: row.account_plan_version_id,
  userPlanVersionId: row.user_plan_version_id,
  accountConsumedAfter: row.account_consumed_after,
  userConsumedAfter: row.user_consumed_after,
  period: periodFromDate(row.period),
  createdAt: row.created_at,
  correlationId: row.correlation_id,
  replayCount: row.replay_count,
});

const toView = (row: ViewColumns): UsageRecordDto => ({
  id: row.id,
  accountId: row.account_id,
  accountName: row.account_name,
  userId: row.user_id,
  externalUserId: row.external_user_id,
  requestId: row.request_id,
  unitsRequested: row.units_requested,
  unitsConsumed: row.outcome === 'accepted' ? row.units_requested : 0,
  outcome: row.outcome,
  rejectionRule: row.rejection_rule,
  rejectionLevel: row.rejection_level,
  accountPlan: { planId: row.account_plan_id, planName: row.account_plan_name, planVersionId: row.account_plan_version_id, version: row.account_plan_version },
  userPlan: { planId: row.user_plan_id, planName: row.user_plan_name, planVersionId: row.user_plan_version_id, version: row.user_plan_version },
  period: periodFromDate(row.period),
  createdAt: row.created_at.toISOString(),
  correlationId: row.correlation_id,
  replayCount: row.replay_count,
});

/** WHERE clause for history and aggregates. Alias r = usage_records. */
function whereClause(filter: UsageFilter, params: SqlParams): string {
  const conditions: string[] = [];
  if (filter.accountId) conditions.push(`r.account_id = ${params.add(filter.accountId)}`);
  if (filter.userId) conditions.push(`r.user_id = ${params.add(filter.userId)}`);
  if (filter.externalUserId) {
    conditions.push(`r.user_id IN (SELECT id FROM users WHERE external_user_id = ${params.add(filter.externalUserId)})`);
  }
  if (filter.outcome) conditions.push(`r.outcome = ${params.add(filter.outcome)}`);
  if (filter.period) conditions.push(`r.period = ${params.add(periodToDate(filter.period))}`);
  // Inclusive UTC dates, expressed as a half-open timestamp range so the indexes can be used.
  if (filter.from) conditions.push(`r.created_at >= ${params.add(filter.from)}::date`);
  if (filter.to) conditions.push(`r.created_at < (${params.add(filter.to)}::date + 1)`);
  if (filter.rule) conditions.push(`r.rejection_rule = ${params.add(filter.rule)}`);
  if (filter.level) conditions.push(`r.rejection_level = ${params.add(filter.level)}`);
  if (filter.minUnits !== undefined) conditions.push(`r.units_requested >= ${params.add(filter.minUnits)}`);
  if (filter.maxUnits !== undefined) conditions.push(`r.units_requested <= ${params.add(filter.maxUnits)}`);
  if (filter.requestId) conditions.push(`r.request_id ILIKE ${params.add(likePattern(filter.requestId))}`);
  if (filter.replayed !== undefined) conditions.push(filter.replayed ? 'r.replay_count > 0' : 'r.replay_count = 0');
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

/** Arbitrary namespace for the idempotency advisory locks. */
const IDEMPOTENCY_LOCK_NAMESPACE = 'usage-request';

export class PostgresUsageRepository implements UsageRepository {
  constructor(private readonly db: Queryable) {}

  async lockRequestId(accountId: string, requestId: string): Promise<void> {
    // Released automatically at COMMIT/ROLLBACK. A hash collision only adds waiting, never errors.
    await this.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${IDEMPOTENCY_LOCK_NAMESPACE}:${accountId}:${requestId}`]);
  }

  async findByRequestId(accountId: string, requestId: string): Promise<UsageRecord | null> {
    const { rows } = await this.db.query<RecordColumns>(
      `SELECT r.*, u.external_user_id FROM usage_records r JOIN users u ON u.id = r.user_id
       WHERE r.account_id = $1 AND r.request_id = $2`,
      [accountId, requestId],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async markReplayed(recordId: string, at: Date): Promise<number> {
    const { rows } = await this.db.query<{ replay_count: number }>(
      'UPDATE usage_records SET replay_count = replay_count + 1, last_replayed_at = $2 WHERE id = $1 RETURNING replay_count',
      [recordId, at],
    );
    return rows[0]?.replay_count ?? 0;
  }

  async insert(record: Omit<UsageRecord, 'replayCount' | 'externalUserId'>): Promise<void> {
    await this.db.query(
      `INSERT INTO usage_records (
         id, account_id, user_id, request_id, units_requested, outcome, rejection_rule, rejection_level, violations,
         account_plan_version_id, user_plan_version_id, account_consumed_after, user_consumed_after, period, created_at, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        record.id,
        record.accountId,
        record.userId,
        record.requestId,
        record.unitsRequested,
        record.outcome,
        record.rejectionRule,
        record.rejectionLevel,
        JSON.stringify(record.violations),
        record.accountPlanVersionId,
        record.userPlanVersionId,
        record.accountConsumedAfter,
        record.userConsumedAfter,
        periodToDate(record.period),
        record.createdAt,
        record.correlationId,
      ],
    );
  }

  async findView(recordId: string, accountId: string | null): Promise<UsageRecordDto | null> {
    const { rows } = await this.db.query<ViewColumns>(`${VIEW_SELECT} WHERE r.id = $1 AND ($2::uuid IS NULL OR r.account_id = $2)`, [recordId, accountId]);
    return rows[0] ? toView(rows[0]) : null;
  }

  async list(filter: UsageFilter, window: PageWindow, sort: UsageSort = { field: 'createdAt', order: 'desc' }): Promise<{ rows: UsageRecordDto[]; total: number }> {
    // Whitelisted: created_at, or units then created_at. id keeps the order stable for equal values.
    const direction = sort.order === 'asc' ? 'ASC' : 'DESC';
    const orderBy = sort.field === 'units'
      ? `r.units_requested ${direction}, r.created_at DESC, r.id DESC`
      : `r.created_at ${direction}, r.id ${direction}`;
    const params = new SqlParams();
    const where = whereClause(filter, params);
    const countResult = await this.db.query<{ total: number }>(`SELECT count(*) AS total FROM usage_records r ${where}`, params.values);
    const limit = params.add(window.limit);
    const offset = params.add(window.offset);
    // Page first (index order + LIMIT/OFFSET on usage_records alone), then join only that page for
    // display columns. Joining before limiting made PostgreSQL join and sort every matching row.
    // The joins follow foreign keys, so they never add or drop rows: the result is identical.
    const { rows } = await this.db.query<ViewColumns>(
      `WITH page AS (
         SELECT r.* FROM usage_records r ${where}
         ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}
       )
       ${viewSelect('page')}
       ORDER BY ${orderBy}`,
      params.values,
    );
    return { rows: rows.map(toView), total: countResult.rows[0]?.total ?? 0 };
  }

  async requestCounts(filter: UsageFilter): Promise<RequestCounts> {
    const params = new SqlParams();
    const { rows } = await this.db.query<{ accepted: number; rejected: number; units_rejected: number }>(
      `SELECT count(*) FILTER (WHERE r.outcome = 'accepted') AS accepted,
              count(*) FILTER (WHERE r.outcome = 'rejected') AS rejected,
              COALESCE(sum(r.units_requested) FILTER (WHERE r.outcome = 'rejected'), 0) AS units_rejected
       FROM usage_records r ${whereClause(filter, params)}`,
      params.values,
    );
    return { accepted: rows[0]?.accepted ?? 0, rejected: rows[0]?.rejected ?? 0, unitsRejected: rows[0]?.units_rejected ?? 0 };
  }

  async daily(filter: UsageFilter & { period: QuotaPeriod }): Promise<DailyUsagePoint[]> {
    const params = new SqlParams();
    const { rows } = await this.db.query<{ date: string; units_consumed: number; accepted: number; rejected: number }>(
      `SELECT to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
              COALESCE(sum(r.units_requested) FILTER (WHERE r.outcome = 'accepted'), 0) AS units_consumed,
              count(*) FILTER (WHERE r.outcome = 'accepted') AS accepted,
              count(*) FILTER (WHERE r.outcome = 'rejected') AS rejected
       FROM usage_records r ${whereClause(filter, params)}
       GROUP BY 1 ORDER BY 1`,
      params.values,
    );
    return rows.map((row) => ({ date: row.date, unitsConsumed: row.units_consumed, acceptedRequests: row.accepted, rejectedRequests: row.rejected }));
  }

  async rejectionsByRule(filter: UsageFilter): Promise<RejectionBreakdownItem[]> {
    const params = new SqlParams();
    const where = whereClause({ ...filter, outcome: 'rejected' }, params);
    const { rows } = await this.db.query<{ rule: RuleCode; level: RuleLevel; count: number }>(
      `SELECT r.rejection_rule AS rule, r.rejection_level AS level, count(*) AS count
       FROM usage_records r ${where}
       GROUP BY 1, 2 ORDER BY 3 DESC, 1, 2`,
      params.values,
    );
    return rows;
  }

  /** Units come from the counter table (cheap); request counts from usage_records by period. */
  async monthly(periods: QuotaPeriod[], scope: { accountId?: string; userId?: string } = {}): Promise<MonthlyUsagePoint[]> {
    const dates = periods.map(periodToDate);
    // Units come from the counters of the narrowest scope; request counts from usage_records.
    const [units, records, params] = scope.userId
      ? ['SELECT sum(c.consumed) FROM user_usage_counters c WHERE c.period = m.period AND c.user_id = $2', 'AND r.user_id = $2', [dates, scope.userId]]
      : scope.accountId
        ? ['SELECT sum(c.consumed) FROM account_usage_counters c WHERE c.period = m.period AND c.account_id = $2', 'AND r.account_id = $2', [dates, scope.accountId]]
        : ['SELECT sum(c.consumed) FROM account_usage_counters c WHERE c.period = m.period', '', [dates]];
    const { rows } = await this.db.query<{ period: string; units: number; accepted: number; rejected: number }>(
      `SELECT m.period::text AS period,
              COALESCE((${units}), 0) AS units,
              (SELECT count(*) FROM usage_records r WHERE r.period = m.period AND r.outcome = 'accepted' ${records}) AS accepted,
              (SELECT count(*) FROM usage_records r WHERE r.period = m.period AND r.outcome = 'rejected' ${records}) AS rejected
       FROM unnest($1::date[]) AS m(period)
       ORDER BY m.period`,
      params,
    );
    return rows.map((row) => ({ period: periodFromDate(row.period), unitsConsumed: row.units, acceptedRequests: row.accepted, rejectedRequests: row.rejected }));
  }
}
