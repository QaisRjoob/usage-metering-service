/**
 * MOCK DATA AND MOCK LOGIC - development adapter only.
 *
 * An in-memory stand-in for the API so the web app works without a backend. It deliberately
 * follows the real business semantics (two-level evaluation, documented rule order, rejection
 * consumes nothing, idempotent replay, plan versions) so the Client Demo scenario can be exercised.
 * The backend remains authoritative; nothing here is used when VITE_DATA_SOURCE=api.
 */
import {
  APPROACHING_LIMIT_THRESHOLD_PERCENT,
  ERROR_CODES,
  RULE_EVALUATION_ORDER,
  buildPage,
  type AccountDetails,
  type AccountListItem,
  type AccountUsageSummary,
  type ActivitySummary,
  type AdminAnalyticsSummary,
  type ConsumeDecision,
  type ConsumeRequest,
  type DailyUsagePoint,
  type MonthlyUsagePoint,
  type PaginatedResponse,
  type Plan,
  type PlanDetails,
  type PlanScope,
  type QuotaCheckResult,
  type QuotaSnapshot,
  type QuotaStatus,
  type RejectionBreakdownItem,
  type RequestCounts,
  type RuleLevel,
  type RuleViolation,
  type SignupStatus,
  type UsageOutcome,
  type UsageRecord,
  type UserSummary,
  type UserUsageSummary,
  type UserWithQuota,
} from '@/contracts';
import { ApiError } from '@/services/api/apiErrors';
import { addMonths, daysInMonth, monthKeyOf } from '@/utils/dateUtils';

export interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  scope: PlanScope;
  isPredefined: boolean;
  ownerAccountId: string | null;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanVersionRow {
  id: string;
  planId: string;
  version: number;
  monthlyAllowance: number;
  maxUnitsPerRequest: number;
  createdAt: string;
}

export interface AccountRow {
  id: string;
  name: string;
  apiKey: string;
  apiKeyPrefix: string;
  planId: string;
  createdAt: string;
}

export interface UserRow {
  id: string;
  accountId: string;
  externalUserId: string;
  displayName: string | null;
  planId: string;
  createdAt: string;
}

export interface RequestRow {
  id: string;
  accountId: string;
  userId: string;
  requestId: string;
  unitsRequested: number;
  outcome: UsageOutcome;
  violations: RuleViolation[];
  accountPlanVersionId: string;
  userPlanVersionId: string;
  period: string;
  createdAt: string;
  accountConsumedAfter: number;
  userConsumedAfter: number;
  correlationId: string | null;
  replayCount: number;
}

/** A self-service sign-up request (the mock keeps the claim code itself; the API stores its hash). */
export interface SignupRow {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  useCase: string | null;
  requestedPlanId: string;
  claimCode: string;
  status: SignupStatus;
  decisionNote: string | null;
  accountId: string | null;
  submittedAt: string;
  decidedAt: string | null;
  claimedAt: string | null;
}

export interface UsageFilter {
  accountId?: string;
  externalUserId?: string;
  outcome?: UsageOutcome;
  month?: string;
  from?: string;
  to?: string;
  rule?: RuleViolation['rule'];
  level?: RuleLevel;
  minUnits?: number;
  maxUnits?: number;
  requestId?: string;
  replayed?: boolean;
}

function notFound(code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES], message: string): ApiError {
  return new ApiError({ kind: 'http', status: 404, code, message, requestId: 'mock' });
}

function uuid(): string {
  return crypto.randomUUID();
}

/** Same definition as the backend: remaining is clamped at 0; utilization is the real ratio. */
export function computeQuotaNumbers(monthlyAllowance: number, consumed: number) {
  const remaining = Math.max(0, monthlyAllowance - consumed);
  const utilizationPercent = monthlyAllowance === 0 ? 100 : Math.round((consumed * 1000) / monthlyAllowance) / 10;
  let status: QuotaStatus;
  if (consumed > monthlyAllowance) status = 'over_allowance';
  else if (remaining === 0) status = 'exhausted';
  else if (utilizationPercent >= APPROACHING_LIMIT_THRESHOLD_PERCENT) status = 'warning';
  else status = 'ok';
  return { remaining, utilizationPercent, status };
}

export class MockDatabase {
  readonly plans = new Map<string, PlanRow>();
  readonly versions = new Map<string, PlanVersionRow>();
  readonly accounts = new Map<string, AccountRow>();
  readonly users = new Map<string, UserRow>();
  readonly signupRequests = new Map<string, SignupRow>();
  /** Chronological order (oldest first). */
  readonly requests: RequestRow[] = [];
  /** Idempotency index: UNIQUE (account_id, request_id). */
  private readonly requestIndex = new Map<string, RequestRow>();
  private readonly accountCounters = new Map<string, number>();
  private readonly userCounters = new Map<string, number>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  now(): Date {
    return this.clock();
  }

  currentPeriod(): string {
    return monthKeyOf(this.now());
  }

  // ---------------------------------------------------------------- plans

  createPlan(input: {
    id?: string;
    name: string;
    description?: string | null;
    scope: PlanScope;
    isPredefined: boolean;
    ownerAccountId: string | null;
    monthlyAllowance: number;
    maxUnitsPerRequest: number;
    at?: Date;
  }): PlanRow {
    const createdAt = (input.at ?? this.now()).toISOString();
    const planId = input.id ?? uuid();
    const version: PlanVersionRow = {
      id: uuid(),
      planId,
      version: 1,
      monthlyAllowance: input.monthlyAllowance,
      maxUnitsPerRequest: input.maxUnitsPerRequest,
      createdAt,
    };
    const plan: PlanRow = {
      id: planId,
      name: input.name,
      description: input.description ?? null,
      scope: input.scope,
      isPredefined: input.isPredefined,
      ownerAccountId: input.ownerAccountId,
      currentVersionId: version.id,
      createdAt,
      updatedAt: createdAt,
    };
    this.versions.set(version.id, version);
    this.plans.set(plan.id, plan);
    return plan;
  }

  /** Plans visible to an account: predefined plans plus its own custom plans. */
  visiblePlan(planId: string, accountId: string): PlanRow {
    const plan = this.plans.get(planId);
    if (!plan || (!plan.isPredefined && plan.ownerAccountId !== accountId)) {
      throw notFound(ERROR_CODES.PLAN_NOT_FOUND, 'Plan not found.');
    }
    return plan;
  }

  versionOf(plan: PlanRow): PlanVersionRow {
    const version = this.versions.get(plan.currentVersionId);
    if (!version) throw new Error(`Plan ${plan.id} has no current version`);
    return version;
  }

  planVersions(planId: string): PlanVersionRow[] {
    return [...this.versions.values()].filter((version) => version.planId === planId).sort((a, b) => b.version - a.version);
  }

  /** Updates a plan; a limit change creates a new immutable version. */
  updatePlan(
    plan: PlanRow,
    patch: { name?: string; description?: string | null; monthlyAllowance?: number; maxUnitsPerRequest?: number },
  ): PlanRow {
    const current = this.versionOf(plan);
    const now = this.now().toISOString();
    const monthlyAllowance = patch.monthlyAllowance ?? current.monthlyAllowance;
    const maxUnitsPerRequest = patch.maxUnitsPerRequest ?? current.maxUnitsPerRequest;
    if (monthlyAllowance !== current.monthlyAllowance || maxUnitsPerRequest !== current.maxUnitsPerRequest) {
      const next: PlanVersionRow = {
        id: uuid(),
        planId: plan.id,
        version: current.version + 1,
        monthlyAllowance,
        maxUnitsPerRequest,
        createdAt: now,
      };
      this.versions.set(next.id, next);
      plan.currentVersionId = next.id;
    }
    if (patch.name !== undefined) plan.name = patch.name;
    if (patch.description !== undefined) plan.description = patch.description;
    plan.updatedAt = now;
    return plan;
  }

  planDto(plan: PlanRow): Plan {
    const version = this.versionOf(plan);
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      scope: plan.scope,
      isPredefined: plan.isPredefined,
      ownerAccountId: plan.ownerAccountId,
      currentVersion: { ...version },
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  planDetailsDto(plan: PlanRow, accountId: string): PlanDetails {
    const accountUsers = [...this.users.values()].filter((user) => user.accountId === accountId);
    const account = this.accounts.get(accountId);
    return {
      ...this.planDto(plan),
      versions: this.planVersions(plan.id).map((version) => ({ ...version })),
      assignedAccounts: account?.planId === plan.id ? 1 : 0,
      assignedUsers: accountUsers.filter((user) => user.planId === plan.id).length,
    };
  }

  // ---------------------------------------------------------------- accounts & users

  createAccount(input: { id?: string; name: string; planId: string; apiKey?: string; at?: Date }): { row: AccountRow; apiKey: string } {
    const apiKey = input.apiKey ?? `umk_live_${uuid().replace(/-/g, '')}`;
    const row: AccountRow = {
      id: input.id ?? uuid(),
      name: input.name,
      apiKey,
      apiKeyPrefix: apiKey.slice(0, 13),
      planId: input.planId,
      createdAt: (input.at ?? this.now()).toISOString(),
    };
    this.accounts.set(row.id, row);
    return { row, apiKey };
  }

  findAccountByKey(apiKey: string): AccountRow | undefined {
    return [...this.accounts.values()].find((account) => account.apiKey === apiKey);
  }

  getAccount(accountId: string): AccountRow {
    const account = this.accounts.get(accountId);
    if (!account) throw notFound(ERROR_CODES.ACCOUNT_NOT_FOUND, 'Account not found.');
    return account;
  }

  createUser(input: { accountId: string; externalUserId: string; displayName?: string | null; planId: string; at?: Date }): UserRow {
    const row: UserRow = {
      id: uuid(),
      accountId: input.accountId,
      externalUserId: input.externalUserId,
      displayName: input.displayName ?? null,
      planId: input.planId,
      createdAt: (input.at ?? this.now()).toISOString(),
    };
    this.users.set(row.id, row);
    return row;
  }

  accountUsers(accountId: string): UserRow[] {
    return [...this.users.values()].filter((user) => user.accountId === accountId);
  }

  /** Finds a user by external id inside one account. Other accounts' users are "not found". */
  findUser(accountId: string, externalUserId: string): UserRow | undefined {
    return [...this.users.values()].find((user) => user.accountId === accountId && user.externalUserId === externalUserId);
  }

  getUser(accountId: string, externalUserId: string): UserRow {
    const user = this.findUser(accountId, externalUserId);
    if (!user) throw notFound(ERROR_CODES.USER_NOT_FOUND, `User "${externalUserId}" was not found in this account.`);
    return user;
  }

  userSummary(user: UserRow): UserSummary {
    return { id: user.id, externalUserId: user.externalUserId, displayName: user.displayName, createdAt: user.createdAt };
  }

  // ---------------------------------------------------------------- quotas

  accountConsumed(accountId: string, period: string): number {
    return this.accountCounters.get(`${accountId}|${period}`) ?? 0;
  }

  userConsumed(userId: string, period: string): number {
    return this.userCounters.get(`${userId}|${period}`) ?? 0;
  }

  snapshot(level: RuleLevel, planId: string, consumed: number, period: string): QuotaSnapshot {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Unknown plan ${planId}`);
    const version = this.versionOf(plan);
    return {
      level,
      period,
      planId: plan.id,
      planName: plan.name,
      planVersionId: version.id,
      planVersion: version.version,
      monthlyAllowance: version.monthlyAllowance,
      maxUnitsPerRequest: version.maxUnitsPerRequest,
      consumed,
      ...computeQuotaNumbers(version.monthlyAllowance, consumed),
    };
  }

  accountSnapshot(account: AccountRow, period: string): QuotaSnapshot {
    return this.snapshot('account', account.planId, this.accountConsumed(account.id, period), period);
  }

  userSnapshot(user: UserRow, period: string): QuotaSnapshot {
    return this.snapshot('user', user.planId, this.userConsumed(user.id, period), period);
  }

  /** Evaluates both plans in the documented order. Pure: does not change any counter. */
  evaluate(account: AccountRow, user: UserRow, units: number, period: string) {
    const accountVersion = this.versionOf(this.plans.get(account.planId)!);
    const userVersion = this.versionOf(this.plans.get(user.planId)!);
    const accountPlanName = this.plans.get(account.planId)!.name;
    const userPlanName = this.plans.get(user.planId)!.name;
    const consumed = { account: this.accountConsumed(account.id, period), user: this.userConsumed(user.id, period) };
    const versions = { account: accountVersion, user: userVersion };
    const planNames = { account: accountPlanName, user: userPlanName };

    const violations: RuleViolation[] = [];
    for (const { rule, level } of RULE_EVALUATION_ORDER) {
      const version = versions[level];
      if (rule === 'MAX_UNITS_PER_REQUEST' && units > version.maxUnitsPerRequest) {
        violations.push({
          rule,
          level,
          limit: version.maxUnitsPerRequest,
          requested: units,
          remaining: null,
          message: `Requested ${units} units, but the ${level} plan "${planNames[level]}" allows at most ${version.maxUnitsPerRequest} per request.`,
        });
      }
      if (rule === 'MONTHLY_ALLOWANCE') {
        const remaining = Math.max(0, version.monthlyAllowance - consumed[level]);
        if (units > remaining) {
          violations.push({
            rule,
            level,
            limit: version.monthlyAllowance,
            requested: units,
            remaining,
            message: `Requested ${units} units, but only ${remaining} of the ${version.monthlyAllowance} monthly units remain at the ${level} level.`,
          });
        }
      }
    }
    return { violations, accountVersion, userVersion };
  }

  check(account: AccountRow, input: { userId: string; units: number }): QuotaCheckResult {
    const user = this.getUser(account.id, input.userId);
    const period = this.currentPeriod();
    const { violations } = this.evaluate(account, user, input.units, period);
    return {
      dryRun: true,
      allowed: violations.length === 0,
      rejection: violations[0] ?? null,
      violations,
      account: this.accountSnapshot(account, period),
      user: this.userSnapshot(user, period),
      period,
      evaluatedAt: this.now().toISOString(),
    };
  }

  /**
   * Consume: idempotency check, two-level evaluation, then all-or-nothing counter update.
   * (The real API does this inside one PostgreSQL transaction with row locks.)
   */
  consume(account: AccountRow, input: ConsumeRequest, at?: Date): ConsumeDecision {
    const idempotencyKey = `${account.id}|${input.requestId}`;
    const existing = this.requestIndex.get(idempotencyKey);
    if (existing) {
      const existingUser = this.users.get(existing.userId)!;
      if (existingUser.externalUserId !== input.userId || existing.unitsRequested !== input.units) {
        throw new ApiError({
          kind: 'http',
          status: 409,
          code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
          message: `requestId "${input.requestId}" was already used with a different userId or units.`,
          requestId: 'mock',
        });
      }
      existing.replayCount += 1;
      return this.decisionFromRow(existing, true);
    }

    const user = this.getUser(account.id, input.userId);
    const processedAt = at ?? this.now();
    const period = monthKeyOf(processedAt);
    const { violations, accountVersion, userVersion } = this.evaluate(account, user, input.units, period);
    const accepted = violations.length === 0;
    if (accepted) {
      this.accountCounters.set(`${account.id}|${period}`, this.accountConsumed(account.id, period) + input.units);
      this.userCounters.set(`${user.id}|${period}`, this.userConsumed(user.id, period) + input.units);
    }
    const row: RequestRow = {
      id: uuid(),
      accountId: account.id,
      userId: user.id,
      requestId: input.requestId,
      unitsRequested: input.units,
      outcome: accepted ? 'accepted' : 'rejected',
      violations,
      accountPlanVersionId: accountVersion.id,
      userPlanVersionId: userVersion.id,
      period,
      createdAt: processedAt.toISOString(),
      accountConsumedAfter: this.accountConsumed(account.id, period),
      userConsumedAfter: this.userConsumed(user.id, period),
      correlationId: `mock-${uuid().slice(0, 8)}`,
      replayCount: 0,
    };
    this.requests.push(row);
    this.requestIndex.set(idempotencyKey, row);
    return this.decisionFromRow(row, false);
  }

  private snapshotForVersion(level: RuleLevel, versionId: string, consumed: number, period: string): QuotaSnapshot {
    const version = this.versions.get(versionId)!;
    const plan = this.plans.get(version.planId)!;
    return {
      level,
      period,
      planId: plan.id,
      planName: plan.name,
      planVersionId: version.id,
      planVersion: version.version,
      monthlyAllowance: version.monthlyAllowance,
      maxUnitsPerRequest: version.maxUnitsPerRequest,
      consumed,
      ...computeQuotaNumbers(version.monthlyAllowance, consumed),
    };
  }

  /** Rebuilds the stored decision (used for both first responses and idempotent replays). */
  private decisionFromRow(row: RequestRow, idempotentReplay: boolean): ConsumeDecision {
    const user = this.users.get(row.userId)!;
    return {
      usageRecordId: row.id,
      requestId: row.requestId,
      userId: user.externalUserId,
      units: row.unitsRequested,
      accepted: row.outcome === 'accepted',
      rejection: row.violations[0] ?? null,
      violations: row.violations,
      account: this.snapshotForVersion('account', row.accountPlanVersionId, row.accountConsumedAfter, row.period),
      user: this.snapshotForVersion('user', row.userPlanVersionId, row.userConsumedAfter, row.period),
      period: row.period,
      processedAt: row.createdAt,
      idempotentReplay,
    };
  }

  // ---------------------------------------------------------------- history & analytics

  usageRecordDto(row: RequestRow): UsageRecord {
    const account = this.accounts.get(row.accountId)!;
    const user = this.users.get(row.userId)!;
    const applied = (versionId: string) => {
      const version = this.versions.get(versionId)!;
      const plan = this.plans.get(version.planId)!;
      return { planId: plan.id, planName: plan.name, planVersionId: version.id, version: version.version };
    };
    const rejection = row.violations[0] ?? null;
    return {
      id: row.id,
      accountId: account.id,
      accountName: account.name,
      userId: user.id,
      externalUserId: user.externalUserId,
      requestId: row.requestId,
      unitsRequested: row.unitsRequested,
      unitsConsumed: row.outcome === 'accepted' ? row.unitsRequested : 0,
      outcome: row.outcome,
      rejectionRule: rejection?.rule ?? null,
      rejectionLevel: rejection?.level ?? null,
      accountPlan: applied(row.accountPlanVersionId),
      userPlan: applied(row.userPlanVersionId),
      period: row.period,
      createdAt: row.createdAt,
      correlationId: row.correlationId,
      replayCount: row.replayCount,
    };
  }

  filterRequests(filter: UsageFilter): RequestRow[] {
    const userIds = filter.externalUserId
      ? new Set(
          [...this.users.values()]
            .filter((user) => user.externalUserId === filter.externalUserId && (!filter.accountId || user.accountId === filter.accountId))
            .map((user) => user.id),
        )
      : null;
    return this.requests.filter((row) => {
      if (filter.accountId && row.accountId !== filter.accountId) return false;
      if (userIds && !userIds.has(row.userId)) return false;
      if (filter.outcome && row.outcome !== filter.outcome) return false;
      if (filter.month && row.period !== filter.month) return false;
      const day = row.createdAt.slice(0, 10);
      if (filter.from && day < filter.from) return false;
      if (filter.to && day > filter.to) return false;
      const rejection = row.violations[0];
      if (filter.rule && rejection?.rule !== filter.rule) return false;
      if (filter.level && rejection?.level !== filter.level) return false;
      if (filter.minUnits !== undefined && row.unitsRequested < filter.minUnits) return false;
      if (filter.maxUnits !== undefined && row.unitsRequested > filter.maxUnits) return false;
      if (filter.requestId && !row.requestId.toLowerCase().includes(filter.requestId.toLowerCase())) return false;
      if (filter.replayed !== undefined && (row.replayCount > 0) !== filter.replayed) return false;
      return true;
    });
  }

  /** Newest first with id as tie-breaker, like `ORDER BY created_at DESC, id DESC`. */
  /** Same ordering as the API: created_at (or units, then newest) with id as tie-breaker. */
  listUsage(filter: UsageFilter, page: number, pageSize: number, sort: { field: 'createdAt' | 'units'; order: 'asc' | 'desc' } = { field: 'createdAt', order: 'desc' }): PaginatedResponse<UsageRecord> {
    const direction = sort.order === 'asc' ? 1 : -1;
    const newestFirst = (a: RequestRow, b: RequestRow) => (a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt));
    const rows = this.filterRequests(filter).sort((a, b) =>
      sort.field === 'units'
        ? (a.unitsRequested - b.unitsRequested) * direction || newestFirst(a, b)
        : sort.order === 'asc'
          ? -newestFirst(a, b)
          : newestFirst(a, b),
    );
    const items = rows.slice((page - 1) * pageSize, page * pageSize).map((row) => this.usageRecordDto(row));
    return buildPage(items, page, pageSize, rows.length);
  }

  requestCounts(rows: RequestRow[]): RequestCounts {
    let accepted = 0;
    let rejected = 0;
    let unitsRejected = 0;
    for (const row of rows) {
      if (row.outcome === 'accepted') accepted += 1;
      else {
        rejected += 1;
        unitsRejected += row.unitsRequested;
      }
    }
    return { accepted, rejected, unitsRejected };
  }

  rejectionsByRule(rows: RequestRow[]): RejectionBreakdownItem[] {
    const counts = new Map<string, RejectionBreakdownItem>();
    for (const row of rows) {
      const rejection = row.violations[0];
      if (row.outcome !== 'rejected' || !rejection) continue;
      const key = `${rejection.rule}|${rejection.level}`;
      const item = counts.get(key) ?? { rule: rejection.rule, level: rejection.level, count: 0 };
      item.count += 1;
      counts.set(key, item);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }

  dailySeries(rows: RequestRow[], month: string): DailyUsagePoint[] {
    const points = new Map<string, DailyUsagePoint>();
    const totalDays = month === this.currentPeriod() ? this.now().getUTCDate() : daysInMonth(month);
    for (let day = 1; day <= totalDays; day += 1) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      points.set(date, { date, unitsConsumed: 0, acceptedRequests: 0, rejectedRequests: 0 });
    }
    for (const row of rows) {
      const point = points.get(row.createdAt.slice(0, 10));
      if (!point) continue;
      if (row.outcome === 'accepted') {
        point.unitsConsumed += row.unitsRequested;
        point.acceptedRequests += 1;
      } else point.rejectedRequests += 1;
    }
    return [...points.values()];
  }

  accountListItem(account: AccountRow, period: string): AccountListItem {
    return {
      id: account.id,
      name: account.name,
      apiKeyPrefix: account.apiKeyPrefix,
      createdAt: account.createdAt,
      quota: this.accountSnapshot(account, period),
      userCount: this.accountUsers(account.id).length,
      activity: this.activity((row) => row.accountId === account.id, period),
    };
  }

  /** Request counts of the period and the latest request ever, for the rows matching `belongs`. */
  activity(belongs: (row: RequestRow) => boolean, period: string): ActivitySummary {
    let acceptedRequests = 0;
    let rejectedRequests = 0;
    let lastRequestAt: string | null = null;
    for (const row of this.requests) {
      if (!belongs(row)) continue;
      if (lastRequestAt === null || row.createdAt > lastRequestAt) lastRequestAt = row.createdAt;
      if (row.period !== period) continue;
      if (row.outcome === 'accepted') acceptedRequests += 1;
      else rejectedRequests += 1;
    }
    return { acceptedRequests, rejectedRequests, lastRequestAt };
  }

  /** The month and the five before it, for one account or one user. */
  monthlyFor(period: string, scope: { accountId: string; userId?: string }): MonthlyUsagePoint[] {
    return Array.from({ length: 6 }, (_, index) => addMonths(period, index - 5)).map((month) => {
      const rows = this.filterRequests({ accountId: scope.accountId, month }).filter((row) => !scope.userId || row.userId === scope.userId);
      const counts = this.requestCounts(rows);
      return {
        period: month,
        unitsConsumed: scope.userId ? this.userConsumed(scope.userId, month) : this.accountConsumed(scope.accountId, month),
        acceptedRequests: counts.accepted,
        rejectedRequests: counts.rejected,
      };
    });
  }

  accountDetails(account: AccountRow, period: string): AccountDetails {
    return {
      ...this.accountListItem(account, period),
      requests: this.requestCounts(this.filterRequests({ accountId: account.id, month: period })),
    };
  }

  userWithQuota(user: UserRow, period: string): UserWithQuota {
    return { ...this.userSummary(user), quota: this.userSnapshot(user, period) };
  }

  accountUsageSummary(account: AccountRow, period: string): AccountUsageSummary {
    const rows = this.filterRequests({ accountId: account.id, month: period });
    const users = this.accountUsers(account.id).map((user) => this.userWithQuota(user, period));
    return {
      period,
      account: this.accountSnapshot(account, period),
      requests: this.requestCounts(rows),
      users: {
        total: users.length,
        approachingLimit: users.filter((user) => user.quota.status === 'warning').length,
        atOrOverLimit: users.filter((user) => user.quota.status === 'exhausted' || user.quota.status === 'over_allowance').length,
      },
      daily: this.dailySeries(rows, period),
      rejectionsByRule: this.rejectionsByRule(rows),
      topUsers: [...users].sort((a, b) => b.quota.utilizationPercent - a.quota.utilizationPercent).slice(0, 5),
    };
  }

  userUsageSummary(account: AccountRow, user: UserRow, period: string): UserUsageSummary {
    const rows = this.filterRequests({ accountId: account.id, month: period }).filter((row) => row.userId === user.id);
    return {
      period,
      user: this.userSummary(user),
      quota: this.userSnapshot(user, period),
      accountQuota: this.accountSnapshot(account, period),
      requests: this.requestCounts(rows),
      daily: this.dailySeries(rows, period),
      rejectionsByRule: this.rejectionsByRule(rows),
    };
  }

  adminSummary(period: string): AdminAnalyticsSummary {
    const accounts = [...this.accounts.values()].map((account) => this.accountListItem(account, period));
    const rows = this.filterRequests({ month: period });
    const counts = this.requestCounts(rows);
    const unitsConsumed = accounts.reduce((sum, account) => sum + account.quota.consumed, 0);
    const totalAllowance = accounts.reduce((sum, account) => sum + account.quota.monthlyAllowance, 0);
    const totalRemaining = accounts.reduce((sum, account) => sum + account.quota.remaining, 0);
    const monthly = Array.from({ length: 6 }, (_, index) => addMonths(period, index - 5)).map((month) => {
      const monthRows = this.filterRequests({ month });
      const monthCounts = this.requestCounts(monthRows);
      return {
        period: month,
        unitsConsumed: monthRows.filter((row) => row.outcome === 'accepted').reduce((sum, row) => sum + row.unitsRequested, 0),
        acceptedRequests: monthCounts.accepted,
        rejectedRequests: monthCounts.rejected,
      };
    });
    return {
      period,
      thresholdPercent: APPROACHING_LIMIT_THRESHOLD_PERCENT,
      totals: {
        accounts: accounts.length,
        users: this.users.size,
        unitsConsumed,
        totalAllowance,
        totalRemaining,
        utilizationPercent: totalAllowance === 0 ? 0 : Math.round((unitsConsumed * 1000) / totalAllowance) / 10,
        accountsApproachingLimit: accounts.filter((account) => account.quota.status === 'warning').length,
        accountsAtOrOverLimit: accounts.filter((account) => account.quota.status === 'exhausted' || account.quota.status === 'over_allowance').length,
        acceptedRequests: counts.accepted,
        rejectedRequests: counts.rejected,
      },
      daily: this.dailySeries(rows, period),
      monthly,
      topAccounts: [...accounts].sort((a, b) => b.quota.utilizationPercent - a.quota.utilizationPercent).slice(0, 8),
      recentActivity: this.listUsage({}, 1, 10).items,
    };
  }

  /** Exposed for tests: the counters must always equal the sum of accepted records. */
  sumAccepted(filter: UsageFilter): number {
    return this.filterRequests(filter)
      .filter((row) => row.outcome === 'accepted')
      .reduce((sum, row) => sum + row.unitsRequested, 0);
  }
}
