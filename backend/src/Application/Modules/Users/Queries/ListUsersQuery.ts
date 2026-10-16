import type { PaginatedResponse, UserWithQuota, listUsersQuerySchema } from '../../../../contracts';
import type { z } from 'zod';
import { periodOf } from '../../../../Domain/Quotas/QuotaPeriod';
import type { Clock } from '../../../Common/Clock';
import { pageWindow, toPage } from '../../../Common/Pagination/pagination';
import { toUserWithQuota } from '../DTOs/userMapping';
import type { UserRepository } from '../Interfaces/UserRepository';

export type ListUsersInput = z.output<typeof listUsersQuerySchema>;

/** Users of one account with their individual quota for a month. */
export class ListUsersQuery {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string, input: ListUsersInput): Promise<PaginatedResponse<UserWithQuota>> {
    const period = input.month ?? periodOf(this.clock.now());
    const { rows, total } = await this.users.list(
      accountId,
      {
        period,
        search: input.search,
        planId: input.planId,
        status: input.status,
        minUtilization: input.minUtilization,
        maxUtilization: input.maxUtilization,
        sort: input.sort,
        order: input.order,
      },
      pageWindow(input.page, input.pageSize),
    );
    return toPage(rows, total, input.page, input.pageSize, (row) => toUserWithQuota(row, period));
  }
}
