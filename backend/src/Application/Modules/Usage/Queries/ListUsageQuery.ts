import type { PaginatedResponse, UsageRecord, adminListUsageQuerySchema } from '../../../../contracts';
import type { z } from 'zod';
import { pageWindow, toPage } from '../../../Common/Pagination/pagination';
import type { UsageRepository } from '../Interfaces/UsageRepository';

export type ListUsageInput = z.output<typeof adminListUsageQuerySchema>;

/**
 * Request history (accepted and rejected), newest first, paginated in SQL.
 * Account scope passes the authenticated account id; the operator may pass any accountId filter.
 */
export class ListUsageQuery {
  constructor(private readonly usage: UsageRepository) {}

  async execute(input: ListUsageInput): Promise<PaginatedResponse<UsageRecord>> {
    const { rows, total } = await this.usage.list(
      {
        accountId: input.accountId,
        externalUserId: input.userId,
        outcome: input.outcome,
        period: input.month,
        from: input.from,
        to: input.to,
        rule: input.rule,
        level: input.level,
        minUnits: input.minUnits,
        maxUnits: input.maxUnits,
        requestId: input.requestId,
        replayed: input.replayed,
      },
      pageWindow(input.page, input.pageSize),
      { field: input.sort, order: input.order },
    );
    return toPage(rows, total, input.page, input.pageSize, (row) => row);
  }
}
