import { z } from 'zod';
import { dateSchema, externalUserIdSchema, idSchema, monthSchema } from './common';
import { paginationQuerySchema } from './pagination';
import type { PaginatedResponse } from './pagination';
import type { QuotaSnapshot, RuleCode, RuleLevel } from './quota';
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

export const listUsageQuerySchema = paginationQuerySchema.extend({
  userId: externalUserIdSchema.optional(),
  outcome: z.enum(USAGE_OUTCOMES).optional(),
  month: monthSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});
export type ListUsageParams = Partial<z.infer<typeof listUsageQuerySchema>>;

/** Operator history across accounts. */
export const adminListUsageQuerySchema = listUsageQuerySchema.extend({
  accountId: idSchema.optional(),
});
export type AdminListUsageParams = Partial<z.infer<typeof adminListUsageQuerySchema>>;
