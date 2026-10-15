import type { QuotaPeriod } from '../../../../Domain/Quotas/QuotaPeriod';

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
export interface AnalyticsRepository {
  accountTotals(period: QuotaPeriod): Promise<AccountTotals>;
}
