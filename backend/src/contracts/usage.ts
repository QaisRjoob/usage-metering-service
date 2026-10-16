import { z } from 'zod';
import { dateSchema, externalUserIdSchema, idSchema, monthSchema, queryBooleanSchema, rangeChecks, searchSchema, unitsFilterSchema } from './common';
import { SORT_ORDERS, paginationQuerySchema } from './pagination';
import type { PaginatedResponse } from './pagination';
import { RULE_CODES, RULE_LEVELS, type QuotaSnapshot, type RuleCode, type RuleLevel } from './quota';
import type { UserSummary, UserWithQuota } from './users';

export const USAGE_OUTCOMES = ['accepted', 'rejected'] as const;
export type UsageOutcome = (typeof USAGE_OUTCOMES)[number];

/** The plan version that governed a decision. Kept forever, even after the plan changes. */
export interface AppliedPlanVersion {
  planId: string;
  planName: string;
  planVersionId: string;
  version: number;
}

/** One consume request and its outcome (accepted or rejected). Dry-run checks are not recorded. */
export interface UsageRecord {
  id: string;
  accountId: string;
  accountName: string;
  userId: string;
  externalUserId: string;
  /** Caller-supplied idempotency key. */
  requestId: string;
  unitsRequested: number;
  /** Equals unitsRequested when accepted, 0 when rejected (no partial consumption). */
  unitsConsumed: number;
  outcome: UsageOutcome;
  rejectionRule: RuleCode | null;
  rejectionLevel: RuleLevel | null;
  accountPlan: AppliedPlanVersion;
  userPlan: AppliedPlanVersion;
  /** UTC month the request was processed in. */
  period: string;
  createdAt: string;
  /** X-Request-Id of the HTTP call that produced the decision. */
  correlationId: string | null;
  /** How many times the same request was replayed idempotently. */
  replayCount: number;
}

/** Request activity of an account or user: counts for the selected month, last request ever. */
export interface ActivitySummary {
  acceptedRequests: number;
  rejectedRequests: number;
  /** Timestamp of the most recent consume request (any month), or null if none. */
  lastRequestAt: string | null;
}

export interface RequestCounts {
  accepted: number;
  rejected: number;
  unitsRejected: number;
}

export interface DailyUsagePoint {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  unitsConsumed: number;
  acceptedRequests: number;
  rejectedRequests: number;
}

export interface RejectionBreakdownItem {
  rule: RuleCode;
  level: RuleLevel;
  count: number;
}

/** GET /account/usage-summary?month=YYYY-MM */
export interface AccountUsageSummary {
  period: string;
  account: QuotaSnapshot;
  requests: RequestCounts;
  users: { total: number; approachingLimit: number; atOrOverLimit: number };
  daily: DailyUsagePoint[];
  rejectionsByRule: RejectionBreakdownItem[];
  /** Users with the highest utilization this month (max 5). */
  topUsers: UserWithQuota[];
}

/** GET /users/:userId/usage-summary?month=YYYY-MM */
export interface UserUsageSummary {
  period: string;
  user: UserSummary;
  quota: QuotaSnapshot;
  accountQuota: QuotaSnapshot;
  requests: RequestCounts;
  daily: DailyUsagePoint[];
  rejectionsByRule: RejectionBreakdownItem[];
}

/** GET /quotas - account quota plus a page of user quotas, all for the current month. */
export interface QuotasOverview {
  period: string;
  account: QuotaSnapshot;
  users: PaginatedResponse<UserWithQuota>;
}

export const USAGE_SORT_FIELDS = ['createdAt', 'units'] as const;
export type UsageSortField = (typeof USAGE_SORT_FIELDS)[number];

const usageFilterFields = paginationQuerySchema.extend({
  userId: externalUserIdSchema.optional(),
  outcome: z.enum(USAGE_OUTCOMES).optional(),
  /** Rule that rejected the request (implies outcome=rejected). */
  rule: z.enum(RULE_CODES).optional(),
  /** Level (account/user) of the rule that rejected the request. */
  level: z.enum(RULE_LEVELS).optional(),
  minUnits: unitsFilterSchema.optional(),
  maxUnits: unitsFilterSchema.optional(),
  /** Substring of the caller's request id. */
  requestId: searchSchema(128),
  /** true: only requests that were retried (replayed) at least once; false: never replayed. */
  replayed: queryBooleanSchema.optional(),
  month: monthSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  sort: z.enum(USAGE_SORT_FIELDS).default('createdAt'),
  order: z.enum(SORT_ORDERS).default('desc'),
});
const usageRanges = rangeChecks<{ minUnits?: number; maxUnits?: number; from?: string; to?: string }>([
  ['minUnits', 'maxUnits'],
  ['from', 'to'],
]);

/** GET /usage query DTO. The account always comes from the API key. */
export const listUsageQuerySchema = usageFilterFields.superRefine(usageRanges);
export type ListUsageParams = Partial<z.infer<typeof listUsageQuerySchema>>;

/** GET /admin/usage query DTO: operator history across accounts. */
export const adminListUsageQuerySchema = usageFilterFields.extend({ accountId: idSchema.optional() }).superRefine(usageRanges);
export type AdminListUsageParams = Partial<z.infer<typeof adminListUsageQuerySchema>>;
