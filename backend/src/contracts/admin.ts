import { z } from 'zod';
import { ACTIVITY_FILTERS } from './accounts';
import { dateSchema, idSchema, monthSchema, percentFilterSchema, rangeChecks, searchSchema } from './common';
import { SORT_ORDERS, paginationQuerySchema } from './pagination';
import { QUOTA_STATUSES, type QuotaStatus } from './quota';
import type { ActivitySummary } from './usage';
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
