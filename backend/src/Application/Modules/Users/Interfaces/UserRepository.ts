import type { QuotaStatus, SortOrder, UserSortField } from '../../../../contracts';
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

export interface UserListFilter {
  period: QuotaPeriod;
  search?: string;
  planId?: string;
  status?: QuotaStatus;
  minUtilization?: number;
  maxUtilization?: number;
  sort?: UserSortField;
  order?: SortOrder;
}

export interface UserRepository {
  /** Always scoped by account: another account's user is simply not found. */
  findByExternalId(accountId: string, externalUserId: string): Promise<UsageSubject | null>;
  /** Throws USER_ALREADY_EXISTS when the externalUserId is taken in this account. */
  create(input: { accountId: string; externalUserId: string; displayName: string | null; planId: string; createdAt: Date }): Promise<UsageSubject>;
  updatePlan(userId: string, planId: string, updatedAt: Date): Promise<void>;
  getQuotaRow(accountId: string, externalUserId: string, period: QuotaPeriod): Promise<UserQuotaRow | null>;
  list(accountId: string, filter: UserListFilter, window: PageWindow): Promise<{ rows: UserQuotaRow[]; total: number }>;
  /** Users of an account ordered by utilization, highest first. */
  topByUtilization(accountId: string, period: QuotaPeriod, limit: number): Promise<UserQuotaRow[]>;
  statusCounts(accountId: string, period: QuotaPeriod): Promise<{ total: number; approachingLimit: number; atOrOverLimit: number }>;
}
