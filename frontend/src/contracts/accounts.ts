import { z } from 'zod';
import { ACTIVITY_FILTERS, dateSchema, idSchema, monthSchema, percentFilterSchema, queryBooleanSchema, rangeChecks, searchSchema } from './common';
import { SORT_ORDERS, paginationQuerySchema } from './pagination';
import { PLAN_KINDS, type Plan } from './plans';
import { QUOTA_STATUSES, type QuotaSnapshot } from './quota';
import type { ActivitySummary, RequestCounts } from './usage';

export interface AccountSummary {
  id: string;
  name: string;
  /** Non-secret prefix of the API key, for display only (e.g. "umk_live_3f9a"). */
  apiKeyPrefix: string;
  createdAt: string;
}

/** Row of the operator's accounts table. `quota` is the account-level quota for the requested month. */
export interface AccountListItem extends AccountSummary {
  quota: QuotaSnapshot;
  userCount: number;
  activity: ActivitySummary;
}

export interface AccountDetails extends AccountListItem {
  requests: RequestCounts;
}

/** GET /account - the account identified by the API key. */
export interface CurrentAccountResponse {
  account: AccountSummary;
  plan: Plan;
  quota: QuotaSnapshot;
}

/** POST /admin/accounts - the raw API key appears here once and is never retrievable again. */
export interface CreateAccountResponse {
  account: AccountListItem;
  apiKey: string;
}

export const createAccountSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  planId: idSchema.optional(),
});
export type CreateAccountRequest = z.infer<typeof createAccountSchema>;

/** Whitelisted sort fields; anything else is a 400. */
export const ACCOUNT_SORT_FIELDS = ['name', 'createdAt', 'utilization', 'consumed', 'userCount', 'lastActivity', 'rejected'] as const;
export type AccountSortField = (typeof ACCOUNT_SORT_FIELDS)[number];

/**
 * GET /admin/accounts query DTO. Every filter is applied in SQL; utilization, status and activity
 * refer to `month` (default: current UTC month). `search` matches the account name, account id,
 * API key prefix, or the id / display name of any of the account's users.
 */
export const listAccountsQuerySchema = paginationQuerySchema
  .extend({
    search: searchSchema(100),
    status: z.enum(QUOTA_STATUSES).optional(),
    planId: idSchema.optional(),
    planKind: z.enum(PLAN_KINDS).optional(),
    minUtilization: percentFilterSchema.optional(),
    maxUtilization: percentFilterSchema.optional(),
    createdFrom: dateSchema.optional(),
    createdTo: dateSchema.optional(),
    activity: z.enum(ACTIVITY_FILTERS).optional(),
    hasRejections: queryBooleanSchema.optional(),
    minUsers: z.coerce.number().int().min(0).max(1_000_000).optional(),
    maxUsers: z.coerce.number().int().min(0).max(1_000_000).optional(),
    month: monthSchema.optional(),
    sort: z.enum(ACCOUNT_SORT_FIELDS).default('createdAt'),
    order: z.enum(SORT_ORDERS).default('desc'),
  })
  .superRefine(
    rangeChecks<{ minUtilization?: number; maxUtilization?: number; createdFrom?: string; createdTo?: string; minUsers?: number; maxUsers?: number }>([
      ['minUtilization', 'maxUtilization'],
      ['createdFrom', 'createdTo'],
      ['minUsers', 'maxUsers'],
    ]),
  );
export type ListAccountsParams = Partial<z.infer<typeof listAccountsQuerySchema>>;
