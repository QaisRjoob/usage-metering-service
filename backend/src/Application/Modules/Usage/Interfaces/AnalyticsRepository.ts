import type { ActivityFilter, CompanyStatsSortField, CompanyStatsTotals, QuotaStatus, SortOrder } from '../../../../contracts';
import type { QuotaPeriod } from '../../../../Domain/Quotas/QuotaPeriod';
import type { PageWindow } from '../../../Common/Pagination/pagination';
import type { PlanVersionRow } from '../../Quotas/DTOs/quotaMapping';

export interface AccountTotals {
  accounts: number;
  users: number;
  unitsConsumed: number;
  totalAllowance: number;
  totalRemaining: number;
  accountsApproachingLimit: number;
  accountsAtOrOverLimit: number;
}

/** Aggregates over all accounts for one period, computed in SQL from the counter tables. */
export interface CompanyStatsFilter {
  period: QuotaPeriod;
  search?: string;
  status?: QuotaStatus;
  planId?: string;
  activity?: ActivityFilter;
  sort: CompanyStatsSortField;
  order: SortOrder;
}

export interface CompanyStatsRowData {
  id: string;
  name: string;
  apiKeyPrefix: string;
  createdAt: Date;
  plan: PlanVersionRow;
  isPredefined: boolean;
  consumed: number;
  users: number;
  activeUsers: number;
  accepted: number;
  rejected: number;
  unitsRejected: number;
  lastRequestAt: Date | null;
}

export interface AnalyticsRepository {
  accountTotals(period: QuotaPeriod): Promise<AccountTotals>;
  /** One page of per-company statistics, totals over every matching company, and all accepted units of the period. */
  companyStats(filter: CompanyStatsFilter, window: PageWindow): Promise<{ rows: CompanyStatsRowData[]; total: number; totals: CompanyStatsTotals; allUnitsConsumed: number }>;
}
