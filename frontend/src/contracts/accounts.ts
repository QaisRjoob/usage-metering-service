import { z } from 'zod';
import { idSchema, monthSchema } from './common';
import { SORT_ORDERS, paginationQuerySchema } from './pagination';
import type { Plan } from './plans';
import { QUOTA_STATUSES, type QuotaSnapshot } from './quota';
import type { RequestCounts } from './usage';

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

export const ACCOUNT_SORT_FIELDS = ['name', 'createdAt', 'utilization'] as const;
export type AccountSortField = (typeof ACCOUNT_SORT_FIELDS)[number];

export const listAccountsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(QUOTA_STATUSES).optional(),
  month: monthSchema.optional(),
  sort: z.enum(ACCOUNT_SORT_FIELDS).default('createdAt'),
  order: z.enum(SORT_ORDERS).default('desc'),
});
export type ListAccountsParams = Partial<z.infer<typeof listAccountsQuerySchema>>;
