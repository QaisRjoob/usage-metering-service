import type { AccountSortField, PlanKind, QuotaStatus, SortOrder } from '../../../../contracts';
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
}

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
  sort: AccountSortField;
  order: SortOrder;
}

export interface AccountRepository {
  findByApiKeyHash(apiKeyHash: string): Promise<AuthenticatedAccount | null>;
  findById(accountId: string): Promise<Account | null>;
  create(input: { name: string; apiKeyHash: string; apiKeyPrefix: string; planId: string; createdAt: Date }): Promise<Account>;
  updatePlan(accountId: string, planId: string, updatedAt: Date): Promise<void>;
  getQuotaRow(accountId: string, period: QuotaPeriod): Promise<AccountQuotaRow | null>;
  list(filter: AccountListFilter, window: PageWindow): Promise<{ rows: AccountQuotaRow[]; total: number }>;
}
