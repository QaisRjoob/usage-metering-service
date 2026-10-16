import type {
  AccountFacets,
  AdminSearchResult,
  AdminUserListItem,
  PaginatedResponse,
  UserFacets,
  accountFacetsQuerySchema,
  adminListUsersQuerySchema,
  userFacetsQuerySchema,
} from '../../../../contracts';
import type { z } from 'zod';
import { periodOf } from '../../../../Domain/Quotas/QuotaPeriod';
import type { Clock } from '../../../Common/Clock';
import { pageWindow, toPage } from '../../../Common/Pagination/pagination';
import { toActivitySummary } from '../../Accounts/DTOs/accountMapping';
import type { AccountRepository } from '../../Accounts/Interfaces/AccountRepository';
import { toUserWithQuota } from '../../Users/DTOs/userMapping';
import type { UserRepository } from '../../Users/Interfaces/UserRepository';

/** Operator directory: cross-account lookups (category counts, users of every company, finder). */

export class GetAccountFacetsQuery {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: z.output<typeof accountFacetsQuerySchema>): Promise<AccountFacets> {
    const period = input.month ?? periodOf(this.clock.now());
    return { period, ...(await this.accounts.facets({ period, search: input.search })) };
  }
}

export class ListDirectoryUsersQuery {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: z.output<typeof adminListUsersQuerySchema>): Promise<PaginatedResponse<AdminUserListItem>> {
    const period = input.month ?? periodOf(this.clock.now());
    const { rows, total } = await this.users.listDirectory(
      {
        period,
        search: input.search,
        accountId: input.accountId,
        planId: input.planId,
        status: input.status,
        minUtilization: input.minUtilization,
        maxUtilization: input.maxUtilization,
        activity: input.activity,
        createdFrom: input.createdFrom,
        createdTo: input.createdTo,
        sort: input.sort,
        order: input.order,
      },
      pageWindow(input.page, input.pageSize),
    );
    return toPage(rows, total, input.page, input.pageSize, (row) => ({
      ...toUserWithQuota(row, period),
      account: { id: row.accountId, name: row.accountName },
      activity: toActivitySummary(row.activity),
    }));
  }
}

export class GetUserFacetsQuery {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: z.output<typeof userFacetsQuerySchema>): Promise<UserFacets> {
    const period = input.month ?? periodOf(this.clock.now());
    return { period, ...(await this.users.directoryFacets({ period, search: input.search, accountId: input.accountId })) };
  }
}

/** Header finder: a few companies and users matching the text, best matches first. */
export class AdminSearchQuery {
  static readonly LIMIT = 6;

  constructor(
    private readonly accounts: AccountRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(query: string): Promise<AdminSearchResult> {
    const [accounts, users] = await Promise.all([this.accounts.quickSearch(query, AdminSearchQuery.LIMIT), this.users.quickSearch(query, AdminSearchQuery.LIMIT)]);
    return { accounts, users };
  }
}
