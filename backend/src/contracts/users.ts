import { z } from 'zod';
import { externalUserIdSchema, idSchema, monthSchema } from './common';
import { paginationQuerySchema } from './pagination';
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

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(128).optional(),
  planId: idSchema.optional(),
  status: z.enum(QUOTA_STATUSES).optional(),
  month: monthSchema.optional(),
});
export type ListUsersParams = Partial<z.infer<typeof listUsersQuerySchema>>;
