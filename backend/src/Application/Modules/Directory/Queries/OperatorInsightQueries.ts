import type { AdminAccountUsageSummary, AdminUserOverview, CompanyStatsResponse, companyStatsQuerySchema } from '../../../../contracts';
import { buildPage } from '../../../../contracts';
import type { z } from 'zod';
import { accountNotFound } from '../../../../Domain/Accounts/AccountErrors';
import { addPeriods, periodOf, type QuotaPeriod } from '../../../../Domain/Quotas/QuotaPeriod';
import { userNotFound } from '../../../../Domain/Users/UsageSubject';
import type { Clock } from '../../../Common/Clock';
import { pageWindow } from '../../../Common/Pagination/pagination';
import { toAccountSummary } from '../../Accounts/DTOs/accountMapping';
import type { AccountRepository } from '../../Accounts/Interfaces/AccountRepository';
import { toPlanDto } from '../../Plans/DTOs/planMapping';
import type { PlanRepository } from '../../Plans/Interfaces/PlanRepository';
import { toQuotaSnapshot } from '../../Quotas/DTOs/quotaMapping';
import type { AnalyticsRepository } from '../../Usage/Interfaces/AnalyticsRepository';
import type { UsageRepository } from '../../Usage/Interfaces/UsageRepository';
import type { GetAccountUsageSummaryQuery, GetUserUsageSummaryQuery } from '../../Usage/Queries/GetUsageSummaryQueries';

/** Operator drill-down into one company and one of its users, and statistics for every company. */

const lastSixMonths = (period: QuotaPeriod) => Array.from({ length: 6 }, (_, index) => addPeriods(period, index - 5));
const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part * 1000) / whole) / 10);

export class GetAdminAccountUsageSummaryQuery {
  constructor(
    private readonly summary: GetAccountUsageSummaryQuery,
    private readonly usage: UsageRepository,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string, month?: QuotaPeriod): Promise<AdminAccountUsageSummary> {
    const period = month ?? periodOf(this.clock.now());
    const summary = await this.summary.execute(accountId, period);
    return { ...summary, monthly: await this.usage.monthly(lastSixMonths(period), { accountId }) };
  }
}

export class GetAdminUserOverviewQuery {
  constructor(
    private readonly summary: GetUserUsageSummaryQuery,
    private readonly accounts: AccountRepository,
    private readonly plans: PlanRepository,
    private readonly usage: UsageRepository,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string, externalUserId: string, month?: QuotaPeriod): Promise<AdminUserOverview> {
    const period = month ?? periodOf(this.clock.now());
    const account = await this.accounts.findById(accountId);
    if (!account) throw accountNotFound();
    const summary = await this.summary.execute(accountId, externalUserId, period);
    const [planVersion, monthly, latest] = await Promise.all([
      this.plans.findById(summary.quota.planId),
      this.usage.monthly(lastSixMonths(period), { userId: summary.user.id }),
      this.usage.list({ accountId, userId: summary.user.id }, { offset: 0, limit: 1 }),
    ]);
    if (!planVersion) throw userNotFound(externalUserId);
    return {
      ...summary,
      account: { id: account.id, name: account.name },
      plan: toPlanDto(planVersion),
      activity: {
        acceptedRequests: summary.requests.accepted,
        rejectedRequests: summary.requests.rejected,
        lastRequestAt: latest.rows[0]?.createdAt ?? null,
      },
      monthly,
    };
  }
}

export class GetCompanyStatsQuery {
  constructor(
    private readonly analytics: AnalyticsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: z.output<typeof companyStatsQuerySchema>): Promise<CompanyStatsResponse> {
    const period = input.month ?? periodOf(this.clock.now());
    const { rows, total, totals, allUnitsConsumed } = await this.analytics.companyStats(
      { period, search: input.search, status: input.status, planId: input.planId, activity: input.activity, sort: input.sort, order: input.order },
      pageWindow(input.page, input.pageSize),
    );
    const items = rows.map((row) => ({
      account: toAccountSummary(row),
      quota: toQuotaSnapshot('account', period, row.plan, row.consumed),
      isCustomPlan: !row.isPredefined,
      users: row.users,
      activeUsers: row.activeUsers,
      requests: { accepted: row.accepted, rejected: row.rejected, unitsRejected: row.unitsRejected },
      rejectionRatePercent: percent(row.rejected, row.accepted + row.rejected),
      shareOfUsagePercent: percent(row.consumed, allUnitsConsumed),
      lastRequestAt: row.lastRequestAt?.toISOString() ?? null,
    }));
    return { ...buildPage(items, input.page, input.pageSize, total), period, totals };
  }
}
