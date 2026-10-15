import type { AccountUsageSummary, UserUsageSummary } from '../../../../contracts';
import { accountNotFound } from '../../../../Domain/Accounts/AccountErrors';
import { periodOf, type QuotaPeriod } from '../../../../Domain/Quotas/QuotaPeriod';
import { userNotFound } from '../../../../Domain/Users/UsageSubject';
import type { Clock } from '../../../Common/Clock';
import type { AccountRepository } from '../../Accounts/Interfaces/AccountRepository';
import { toQuotaSnapshot } from '../../Quotas/DTOs/quotaMapping';
import { toUserSummary, toUserWithQuota } from '../../Users/DTOs/userMapping';
import type { UserRepository } from '../../Users/Interfaces/UserRepository';
import { fillDailySeries } from '../DTOs/usageMapping';
import type { UsageRepository } from '../Interfaces/UsageRepository';

/**
 * Usage summaries for any month. Totals come from the counter tables; request counts and daily
 * series are SQL aggregates over usage_records (never loaded into memory row by row).
 */
export class GetAccountUsageSummaryQuery {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly users: UserRepository,
    private readonly usage: UsageRepository,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string, month?: QuotaPeriod): Promise<AccountUsageSummary> {
    const now = this.clock.now();
    const period = month ?? periodOf(now);
    const filter = { accountId, period };
    const [account, requests, daily, rejectionsByRule, userCounts, topUsers] = await Promise.all([
      this.accounts.getQuotaRow(accountId, period),
      this.usage.requestCounts(filter),
      this.usage.daily(filter),
      this.usage.rejectionsByRule(filter),
      this.users.statusCounts(accountId, period),
      this.users.topByUtilization(accountId, period, 5),
    ]);
    if (!account) throw accountNotFound();
    return {
      period,
      account: toQuotaSnapshot('account', period, account.plan, account.consumed),
      requests,
      users: userCounts,
      daily: fillDailySeries(daily, period, now),
      rejectionsByRule,
      topUsers: topUsers.map((row) => toUserWithQuota(row, period)),
    };
  }
}

export class GetUserUsageSummaryQuery {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly users: UserRepository,
    private readonly usage: UsageRepository,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string, externalUserId: string, month?: QuotaPeriod): Promise<UserUsageSummary> {
    const now = this.clock.now();
    const period = month ?? periodOf(now);
    const user = await this.users.getQuotaRow(accountId, externalUserId, period);
    if (!user) throw userNotFound(externalUserId);
    const filter = { accountId, userId: user.id, period };
    const [account, requests, daily, rejectionsByRule] = await Promise.all([
      this.accounts.getQuotaRow(accountId, period),
      this.usage.requestCounts(filter),
      this.usage.daily(filter),
      this.usage.rejectionsByRule(filter),
    ]);
    if (!account) throw accountNotFound();
    return {
      period,
      user: toUserSummary(user),
      quota: toQuotaSnapshot('user', period, user.plan, user.consumed),
      accountQuota: toQuotaSnapshot('account', period, account.plan, account.consumed),
      requests,
      daily: fillDailySeries(daily, period, now),
      rejectionsByRule,
    };
  }
}
