import type { ActivityFilter, AdminSearchResult, AdminUserSortField, QuotaStatus, SortOrder, UserFacets, UserSortField } from '../../../../contracts';
import type { ActivityRow } from '../../Accounts/Interfaces/AccountRepository';
import type { QuotaPeriod } from '../../../../Domain/Quotas/QuotaPeriod';
import type { UsageSubject } from '../../../../Domain/Users/UsageSubject';
import type { PageWindow } from '../../../Common/Pagination/pagination';
import type { PlanVersionRow } from '../../Quotas/DTOs/quotaMapping';

/** A user with their current plan version and their consumption in one period. */
export interface UserQuotaRow {
  id: string;
  externalUserId: string;
  displayName: string | null;
  createdAt: Date;
  plan: PlanVersionRow;
  consumed: number;
}

/** A user of one account with the request activity of the period. */
export interface UserListRow extends UserQuotaRow {
  activity: ActivityRow;
}

export interface UserListFilter {
  period: QuotaPeriod;
  search?: string;
  planId?: string;
  status?: QuotaStatus;
  minUtilization?: number;
  maxUtilization?: number;
  activity?: ActivityFilter;
  hasRejections?: boolean;
  /** Inclusive UTC dates, YYYY-MM-DD. */
  createdFrom?: string;
  createdTo?: string;
  sort?: UserSortField;
  order?: SortOrder;
}

/** A user of any account, for the operator's users directory. */
export interface DirectoryUserRow extends UserQuotaRow {
  accountId: string;
  accountName: string;
  activity: ActivityRow;
}

export interface DirectoryUserFilter {
  period: QuotaPeriod;
  search?: string;
  accountId?: string;
  planId?: string;
  status?: QuotaStatus;
  minUtilization?: number;
  maxUtilization?: number;
  activity?: ActivityFilter;
  /** Inclusive UTC dates, YYYY-MM-DD. */
  createdFrom?: string;
  createdTo?: string;
  sort: AdminUserSortField;
  order: SortOrder;
}

export interface UserRepository {
  /** Always scoped by account: another account's user is simply not found. */
  findByExternalId(accountId: string, externalUserId: string): Promise<UsageSubject | null>;
  /** Throws USER_ALREADY_EXISTS when the externalUserId is taken in this account. */
  create(input: { accountId: string; externalUserId: string; displayName: string | null; planId: string; createdAt: Date }): Promise<UsageSubject>;
  updatePlan(userId: string, planId: string, updatedAt: Date): Promise<void>;
  getQuotaRow(accountId: string, externalUserId: string, period: QuotaPeriod): Promise<UserQuotaRow | null>;
  list(accountId: string, filter: UserListFilter, window: PageWindow): Promise<{ rows: UserListRow[]; total: number }>;
  /** Users of an account ordered by utilization, highest first. */
  topByUtilization(accountId: string, period: QuotaPeriod, limit: number): Promise<UserQuotaRow[]>;
  statusCounts(accountId: string, period: QuotaPeriod): Promise<{ total: number; approachingLimit: number; atOrOverLimit: number }>;
  /** Operator: users of every account. */
  listDirectory(filter: DirectoryUserFilter, window: PageWindow): Promise<{ rows: DirectoryUserRow[]; total: number }>;
  /** Operator: category counts within `search` and `accountId`. */
  directoryFacets(filter: { period: QuotaPeriod; search?: string; accountId?: string }): Promise<Omit<UserFacets, 'period'>>;
  /** Operator finder: users by external id, display name or id. */
  quickSearch(query: string, limit: number): Promise<AdminSearchResult['users']>;
}
