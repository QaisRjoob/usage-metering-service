import type { AccountListItem } from './accounts';
import type { DailyUsagePoint, UsageRecord } from './usage';

export interface MonthlyUsagePoint {
  period: string;
  unitsConsumed: number;
  acceptedRequests: number;
  rejectedRequests: number;
}

/**
 * GET /admin/analytics/summary?month=YYYY-MM - operator dashboard metrics across all accounts.
 *
 * totalAllowance       sum of every account's monthly allowance (account plans only)
 * totalRemaining       sum of every account's clamped remaining units
 * utilizationPercent   unitsConsumed / totalAllowance * 100 (actual, can exceed 100)
 */
export interface AdminAnalyticsSummary {
  period: string;
  thresholdPercent: number;
  totals: {
    accounts: number;
    users: number;
    unitsConsumed: number;
    totalAllowance: number;
    totalRemaining: number;
    utilizationPercent: number;
    accountsApproachingLimit: number;
    accountsAtOrOverLimit: number;
    acceptedRequests: number;
    rejectedRequests: number;
  };
  daily: DailyUsagePoint[];
  /** The selected month and the five before it, oldest first. */
  monthly: MonthlyUsagePoint[];
  /** Accounts with the highest utilization (max 8). */
  topAccounts: AccountListItem[];
  /** Latest 10 decisions across accounts. */
  recentActivity: UsageRecord[];
}
