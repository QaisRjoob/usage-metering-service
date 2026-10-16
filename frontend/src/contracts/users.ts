import { z } from 'zod';
import { externalUserIdSchema, idSchema, monthSchema, percentFilterSchema, rangeChecks, searchSchema } from './common';
import { SORT_ORDERS, paginationQuerySchema } from './pagination';
import type { Plan } from './plans';
import { QUOTA_STATUSES, type QuotaSnapshot } from './quota';

export interface UserSummary {
  id: string;
  /** Identifier chosen by the calling application. Unique per account; used in all user routes. */
  externalUserId: string;
  displayName: string | null;
  createdAt: string;
}

/** A user with their individual (user-level) quota for the requested month. */
export interface UserWithQuota extends UserSummary {
  quota: QuotaSnapshot;
}

/** GET /users/:userId - the user, their plan, and both quota levels that apply to them. */
export interface UserDetails {
  user: UserSummary;
  plan: Plan;
  quota: QuotaSnapshot;
  accountQuota: QuotaSnapshot;
}

export const createUserSchema = z.object({
  externalUserId: externalUserIdSchema,
  displayName: z.string().trim().min(1).max(100).optional(),
  planId: idSchema.optional(),
});
export type CreateUserRequest = z.infer<typeof createUserSchema>;

export const USER_SORT_FIELDS = ['externalUserId', 'createdAt', 'utilization', 'consumed'] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

const usersFilterFields = paginationQuerySchema.extend({
  search: searchSchema(128),
  planId: idSchema.optional(),
  status: z.enum(QUOTA_STATUSES).optional(),
  minUtilization: percentFilterSchema.optional(),
  maxUtilization: percentFilterSchema.optional(),
  month: monthSchema.optional(),
  sort: z.enum(USER_SORT_FIELDS).default('externalUserId'),
  order: z.enum(SORT_ORDERS).default('asc'),
});
const userRanges = rangeChecks<{ minUtilization?: number; maxUtilization?: number }>([['minUtilization', 'maxUtilization']]);

/** GET /users and GET /admin/accounts/:id/users query DTO (user-level quota of `month`). */
export const listUsersQuerySchema = usersFilterFields.superRefine(userRanges);
export type ListUsersParams = Partial<z.infer<typeof listUsersQuerySchema>>;

/** GET /quotas query DTO: same filters, always the current month. */
export const quotasQuerySchema = usersFilterFields.omit({ month: true }).superRefine(userRanges);
export type QuotasQueryParams = Partial<z.infer<typeof quotasQuerySchema>>;
