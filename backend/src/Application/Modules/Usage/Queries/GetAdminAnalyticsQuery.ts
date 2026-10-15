import { APPROACHING_LIMIT_THRESHOLD_PERCENT, type AdminAnalyticsSummary } from '../../../../contracts';
import { addPeriods, periodOf, type QuotaPeriod } from '../../../../Domain/Quotas/QuotaPeriod';
import type { Clock } from '../../../Common/Clock';
import { toAccountListItem } from '../../Accounts/DTOs/accountMapping';
import type { AccountRepository } from '../../Accounts/Interfaces/AccountRepository';
import { fillDailySeries } from '../DTOs/usageMapping';
import type { AnalyticsRepository } from '../Interfaces/AnalyticsRepository';
import type { UsageRepository } from '../Interfaces/UsageRepository';

/**
 * GET /admin/analytics/summary - operator dashboard.
 * utilizationPercent = unitsConsumed / totalAllowance (actual ratio, 0 when nothing is allocated).
 */
export class GetAdminAnalyticsQuery {
  constructor(
    private readonly analytics: AnalyticsRepository,
    private readonly accounts: AccountRepository,
    private readonly usage: UsageRepository,
    private readonly clock: Clock,
  ) {}

  async execute(month?: QuotaPeriod): Promise<AdminAnalyticsSummary> {
    const now = this.clock.now();
    const period = month ?? periodOf(now);
    const months = Array.from({ length: 6 }, (_, index) => addPeriods(period, index - 5));
    const [totals, requests, daily, monthly, top, recent] = await Promise.all([
      this.analytics.accountTotals(period),
      this.usage.requestCounts({ period }),
      this.usage.daily({ period }),
      this.usage.monthly(months),
      this.accounts.list({ period, sort: 'utilization', order: 'desc' }, { offset: 0, limit: 8 }),
      this.usage.list({}, { offset: 0, limit: 10 }),
    ]);
    return {
      period,
      thresholdPercent: APPROACHING_LIMIT_THRESHOLD_PERCENT,
      totals: {
        ...totals,
        utilizationPercent: totals.totalAllowance === 0 ? 0 : Math.round((totals.unitsConsumed * 1000) / totals.totalAllowance) / 10,
        acceptedRequests: requests.accepted,
        rejectedRequests: requests.rejected,
      },
      daily: fillDailySeries(daily, period, now),
      monthly,
      topAccounts: top.rows.map((row) => toAccountListItem(row, period)),
      recentActivity: recent.rows,
    };
  }
}
