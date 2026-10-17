import type { AccountFacets, AccountSortField, ActivityFilter, AdminSearchResult, PlanKind, QuotaStatus, SortOrder } from '../../../../contracts';
import type { Account, AuthenticatedAccount } from '../../../../Domain/Accounts/Account';
import type { QuotaPeriod } from '../../../../Domain/Quotas/QuotaPeriod';
import type { PageWindow } from '../../../Common/Pagination/pagination';
import type { PlanVersionRow } from '../../Quotas/DTOs/quotaMapping';

/** An account with its current plan version and its consumption in one period. */
export interface AccountQuotaRow {
  id: string;
  name: string;
  apiKeyPrefix: string;
  createdAt: Date;
  plan: PlanVersionRow;
  consumed: number;
  userCount: number;
  activity: ActivityRow;
}

/** Request counts of one month and the most recent request ever. */
export interface ActivityRow {
  acceptedRequests: number;
  rejectedRequests: number;
  lastRequestAt: Date | null;
}

export const NO_ACTIVITY: ActivityRow = { acceptedRequests: 0, rejectedRequests: 0, lastRequestAt: null };

export interface AccountListFilter {
  period: QuotaPeriod;
  search?: string;
  status?: QuotaStatus;
  planId?: string;
  planKind?: PlanKind;
  minUtilization?: number;
  maxUtilization?: number;
  /** Inclusive UTC dates, YYYY-MM-DD. */
  createdFrom?: string;
  createdTo?: string;
  activity?: ActivityFilter;
  hasRejections?: boolean;
  minUsers?: number;
  maxUsers?: number;
  sort: AccountSortField;
  order: SortOrder;
}

export interface AccountRepository {
  findByApiKeyHash(apiKeyHash: string): Promise<AuthenticatedAccount | null>;
  findById(accountId: string): Promise<Account | null>;
  create(input: { name: string; apiKeyHash: string; apiKeyPrefix: string; planId: string; createdAt: Date }): Promise<Account>;
  updatePlan(accountId: string, planId: string, updatedAt: Date): Promise<void>;
  /** Replaces the account's API key (only its hash and display prefix are stored); returns the replaced hash. */
  updateApiKey(accountId: string, apiKeyHash: string, apiKeyPrefix: string, updatedAt: Date): Promise<string>;
  getQuotaRow(accountId: string, period: QuotaPeriod): Promise<AccountQuotaRow | null>;
  list(filter: AccountListFilter, window: PageWindow): Promise<{ rows: AccountQuotaRow[]; total: number }>;
  /** Category counts (status, plan, activity) within `search`. */
  facets(filter: { period: QuotaPeriod; search?: string }): Promise<Omit<AccountFacets, 'period'>>;
  /** Operator finder: accounts by name, id or API key prefix. */
  quickSearch(query: string, limit: number): Promise<AdminSearchResult['accounts']>;
}
