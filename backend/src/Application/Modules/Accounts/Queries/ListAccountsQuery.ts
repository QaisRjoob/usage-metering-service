import type { AccountListItem, PaginatedResponse, listAccountsQuerySchema } from '../../../../contracts';
import type { z } from 'zod';
import { periodOf } from '../../../../Domain/Quotas/QuotaPeriod';
import type { Clock } from '../../../Common/Clock';
import { pageWindow, toPage } from '../../../Common/Pagination/pagination';
import type { AccountRepository } from '../Interfaces/AccountRepository';
import { toAccountListItem } from '../DTOs/accountMapping';

export type ListAccountsInput = z.output<typeof listAccountsQuerySchema>;

/** Operator: paginated accounts with their account-level quota for a month. */
export class ListAccountsQuery {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: ListAccountsInput): Promise<PaginatedResponse<AccountListItem>> {
    const period = input.month ?? periodOf(this.clock.now());
    const { rows, total } = await this.accounts.list(
      {
        period,
        search: input.search,
        status: input.status,
        planId: input.planId,
        planKind: input.planKind,
        minUtilization: input.minUtilization,
        maxUtilization: input.maxUtilization,
        createdFrom: input.createdFrom,
        createdTo: input.createdTo,
        activity: input.activity,
        hasRejections: input.hasRejections,
        minUsers: input.minUsers,
        maxUsers: input.maxUsers,
        sort: input.sort,
        order: input.order,
      },
      pageWindow(input.page, input.pageSize),
    );
    return toPage(rows, total, input.page, input.pageSize, (row) => toAccountListItem(row, period));
  }
}
