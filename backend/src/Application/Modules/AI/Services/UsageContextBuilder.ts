import type { AccountUsageSummary, AdminAnalyticsSummary } from '../../../../contracts';

/** Upper bound on list lengths in the prompt context, keeping prompts small and predictable. */
const MAX_ITEMS = 8;
const MAX_LABEL_LENGTH = 60;

/**
 * Names and ids come from users of the service, so they are untrusted: control characters are
 * stripped and length is capped. The prompt also tells the model to treat them as data only.
 */
export function sanitizeLabel(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, MAX_LABEL_LENGTH);
}

export interface BuiltContext {
  context: Record<string, unknown>;
  dataPoints: number;
  complete: boolean;
}

/** Account scope: only this account's aggregates. No API keys, no internal user ids. */
export function buildAccountContext(accountName: string, summary: AccountUsageSummary): BuiltContext {
  const activeDays = summary.daily.filter((day) => day.acceptedRequests + day.rejectedRequests > 0);
  return {
    context: {
      period: summary.period,
      account: {
        name: sanitizeLabel(accountName),
        plan: sanitizeLabel(summary.account.planName),
        monthlyAllowance: summary.account.monthlyAllowance,
        maxUnitsPerRequest: summary.account.maxUnitsPerRequest,
        consumed: summary.account.consumed,
        remaining: summary.account.remaining,
        utilizationPercent: summary.account.utilizationPercent,
        status: summary.account.status,
      },
      requests: summary.requests,
      users: summary.users,
      rejectionsByRule: summary.rejectionsByRule,
      usersClosestToTheirLimit: summary.topUsers.slice(0, MAX_ITEMS).map((user) => ({
        user: sanitizeLabel(user.externalUserId),
        plan: sanitizeLabel(user.quota.planName),
        consumed: user.quota.consumed,
        monthlyAllowance: user.quota.monthlyAllowance,
        utilizationPercent: user.quota.utilizationPercent,
        status: user.quota.status,
      })),
      dailyUnits: activeDays.map((day) => ({ date: day.date, units: day.unitsConsumed, rejected: day.rejectedRequests })),
    },
    dataPoints: 1 + summary.rejectionsByRule.length + summary.topUsers.length + activeDays.length,
    complete: summary.topUsers.length <= MAX_ITEMS,
  };
}

/** Operator scope: cross-account aggregates; account names only, no keys. */
export function buildGlobalContext(summary: AdminAnalyticsSummary): BuiltContext {
  const activeDays = summary.daily.filter((day) => day.acceptedRequests + day.rejectedRequests > 0);
  const averageDailyUnits = activeDays.length === 0 ? 0 : Math.round(activeDays.reduce((sum, day) => sum + day.unitsConsumed, 0) / activeDays.length);
  return {
    context: {
      period: summary.period,
      approachingThresholdPercent: summary.thresholdPercent,
      totals: summary.totals,
      monthlyTrend: summary.monthly,
      averageDailyUnits,
      // Days with more than twice the average daily volume - a simple, documented "unusual" rule.
      unusualDays: activeDays.filter((day) => averageDailyUnits > 0 && day.unitsConsumed > 2 * averageDailyUnits).map((day) => ({ date: day.date, units: day.unitsConsumed })),
      accountsClosestToTheirLimit: summary.topAccounts.slice(0, MAX_ITEMS).map((account) => ({
        account: sanitizeLabel(account.name),
        plan: sanitizeLabel(account.quota.planName),
        consumed: account.quota.consumed,
        monthlyAllowance: account.quota.monthlyAllowance,
        utilizationPercent: account.quota.utilizationPercent,
        status: account.quota.status,
        users: account.userCount,
        acceptedRequests: account.activity.acceptedRequests,
        rejectedRequests: account.activity.rejectedRequests,
      })),
    },
    dataPoints: summary.monthly.length + summary.topAccounts.length + activeDays.length + 1,
    complete: summary.topAccounts.length <= MAX_ITEMS,
  };
}
