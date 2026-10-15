import type { ListUsersParams, QuotasOverview } from '../../../../contracts';
import { accountNotFound } from '../../../../Domain/Accounts/AccountErrors';
import { periodOf } from '../../../../Domain/Quotas/QuotaPeriod';
import type { Clock } from '../../../Common/Clock';
import { pageWindow, toPage } from '../../../Common/Pagination/pagination';
import type { AccountRepository } from '../../Accounts/Interfaces/AccountRepository';
import { toUserWithQuota } from '../../Users/DTOs/userMapping';
import type { UserRepository } from '../../Users/Interfaces/UserRepository';
import { toQuotaSnapshot } from '../DTOs/quotaMapping';

/** GET /quotas - the account's shared quota and a page of user quotas for the current month. */
export class GetQuotasOverviewQuery {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string, params: Required<Pick<ListUsersParams, 'page' | 'pageSize'>> & ListUsersParams): Promise<QuotasOverview> {
    const period = periodOf(this.clock.now());
    const [account, users] = await Promise.all([
      this.accounts.getQuotaRow(accountId, period),
      this.users.list(accountId, { period, search: params.search, status: params.status }, pageWindow(params.page, params.pageSize)),
    ]);
    if (!account) throw accountNotFound();
    return {
      period,
      account: toQuotaSnapshot('account', period, account.plan, account.consumed),
      users: toPage(users.rows, users.total, params.page, params.pageSize, (row) => toUserWithQuota(row, period)),
    };
  }
}
