import { z } from 'zod';
import type { AccountSummary } from './accounts';
import type { MonthlyUsagePoint } from './analytics';
import { ACTIVITY_FILTERS, dateSchema, idSchema, monthSchema, percentFilterSchema, rangeChecks, searchSchema } from './common';
import { SORT_ORDERS, paginationQuerySchema, type PaginatedResponse } from './pagination';
import type { Plan } from './plans';
import { QUOTA_STATUSES, type QuotaSnapshot, type QuotaStatus } from './quota';
import type { AccountUsageSummary, ActivitySummary, RequestCounts, UserUsageSummary } from './usage';
import type { UserWithQuota } from './users';

// ------------------------------------------------------------------ category counts (facets)

/** How many items fall in each category, used for the category tabs and chips. */
export interface PlanFacet {
  planId: string;
  planName: string;
  isPredefined: boolean;
  ownerAccountName: string | null;
  count: number;
}

/**
 * GET /admin/accounts/facets - counts per category for the selected month, within `search` only
 * (other filters do not narrow the counts, so every tab shows what clicking it would give).
 */
export interface AccountFacets {
  period: string;
  total: number;
  byStatus: Record<QuotaStatus, number>;
  byPlan: PlanFacet[];
  byActivity: { active: number; inactive: number };
}

export const accountFacetsQuerySchema = z.object({
  search: searchSchema(100),
  month: monthSchema.optional(),
});
export type AccountFacetsParams = Partial<z.infer<typeof accountFacetsQuerySchema>>;

// ------------------------------------------------------------------ users directory

/** A user of any company, with the company, individual quota and activity for the month. */
export interface AdminUserListItem extends UserWithQuota {
  account: { id: string; name: string };
  activity: ActivitySummary;
}

export const ADMIN_USER_SORT_FIELDS = ['externalUserId', 'createdAt', 'utilization', 'consumed', 'accountName', 'lastActivity', 'rejected'] as const;
export type AdminUserSortField = (typeof ADMIN_USER_SORT_FIELDS)[number];

/** GET /admin/users query DTO: every company's users, filtered and paginated in SQL. */
export const adminListUsersQuerySchema = paginationQuerySchema
  .extend({
    /** Matches the user id, display name or internal id. */
    search: searchSchema(128),
    accountId: idSchema.optional(),
    planId: idSchema.optional(),
    status: z.enum(QUOTA_STATUSES).optional(),
    minUtilization: percentFilterSchema.optional(),
    maxUtilization: percentFilterSchema.optional(),
    activity: z.enum(ACTIVITY_FILTERS).optional(),
    createdFrom: dateSchema.optional(),
    createdTo: dateSchema.optional(),
    month: monthSchema.optional(),
    sort: z.enum(ADMIN_USER_SORT_FIELDS).default('lastActivity'),
    order: z.enum(SORT_ORDERS).default('desc'),
  })
  .superRefine(
    rangeChecks<{ minUtilization?: number; maxUtilization?: number; createdFrom?: string; createdTo?: string }>([
      ['minUtilization', 'maxUtilization'],
      ['createdFrom', 'createdTo'],
    ]),
  );
export type AdminListUsersParams = Partial<z.infer<typeof adminListUsersQuerySchema>>;

/** GET /admin/users/facets - category counts within `search` and `accountId`. */
export interface UserFacets {
  period: string;
  total: number;
  byStatus: Record<QuotaStatus, number>;
  byPlan: PlanFacet[];
  byActivity: { active: number; inactive: number };
}

export const userFacetsQuerySchema = z.object({
  search: searchSchema(128),
  accountId: idSchema.optional(),
  month: monthSchema.optional(),
});
export type UserFacetsParams = Partial<z.infer<typeof userFacetsQuerySchema>>;

// ------------------------------------------------------------------ global finder

/** GET /admin/search?q= - quick finder for the operator header (max 6 of each). */
export interface AdminSearchResult {
  accounts: { id: string; name: string; apiKeyPrefix: string; planName: string; userCount: number }[];
  users: { id: string; externalUserId: string; displayName: string | null; accountId: string; accountName: string }[];
}

export const adminSearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Type something to search').max(100),
});
export type AdminSearchParams = z.infer<typeof adminSearchQuerySchema>;

// ------------------------------------------------------------------ company and user drill-down

/** GET /admin/accounts/:accountId/usage-summary - the company's statistics plus a 6-month trend. */
export interface AdminAccountUsageSummary extends AccountUsageSummary {
  /** Selected month and the five before it, for this company only. */
  monthly: MonthlyUsagePoint[];
}

/**
 * One user with plan, both quotas, activity and trends. GET /admin/accounts/:accountId/users/:userId
 * (operator) and GET /users/:userId/overview (the company itself) return the same shape.
 */
export interface AdminUserOverview extends UserUsageSummary {
  account: { id: string; name: string };
  plan: Plan;
  activity: ActivitySummary;
  /** Selected month and the five before it, for this user only. */
  monthly: MonthlyUsagePoint[];
}

export type UserOverview = AdminUserOverview;

// ------------------------------------------------------------------ company statistics

export interface CompanyStatsRow {
  account: AccountSummary;
  quota: QuotaSnapshot;
  isCustomPlan: boolean;
  users: number;
  /** Users with at least one request in the month. */
  activeUsers: number;
  requests: RequestCounts;
  /** rejected / (accepted + rejected), 0 when there were no requests. */
  rejectionRatePercent: number;
  /** This company's accepted units as a share of every company's accepted units in the month. */
  shareOfUsagePercent: number;
  lastRequestAt: string | null;
}

/** Sums over the companies that match the filters. */
export interface CompanyStatsTotals {
  companies: number;
  activeCompanies: number;
  users: number;
  activeUsers: number;
  unitsConsumed: number;
  totalAllowance: number;
  acceptedRequests: number;
  rejectedRequests: number;
  unitsRejected: number;
}

/** GET /admin/analytics/companies - one page of company statistics plus totals. */
export interface CompanyStatsResponse extends PaginatedResponse<CompanyStatsRow> {
  period: string;
  totals: CompanyStatsTotals;
}

export const COMPANY_STATS_SORT_FIELDS = ['name', 'consumed', 'utilization', 'accepted', 'rejected', 'rejectionRate', 'users', 'activeUsers', 'lastActivity'] as const;
export type CompanyStatsSortField = (typeof COMPANY_STATS_SORT_FIELDS)[number];

export const companyStatsQuerySchema = paginationQuerySchema.extend({
  /** Matches the company name, account id or API key prefix. */
  search: searchSchema(100),
  status: z.enum(QUOTA_STATUSES).optional(),
  planId: idSchema.optional(),
  activity: z.enum(ACTIVITY_FILTERS).optional(),
  month: monthSchema.optional(),
  sort: z.enum(COMPANY_STATS_SORT_FIELDS).default('consumed'),
  order: z.enum(SORT_ORDERS).default('desc'),
});
export type CompanyStatsParams = Partial<z.infer<typeof companyStatsQuerySchema>>;
