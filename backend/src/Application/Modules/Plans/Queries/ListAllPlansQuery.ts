import type { AdminPlanListItem, PaginatedResponse, adminListPlansQuerySchema } from '../../../../contracts';
import type { z } from 'zod';
import { pageWindow, toPage } from '../../../Common/Pagination/pagination';
import { toPlanDto } from '../DTOs/planMapping';
import type { PlanRepository } from '../Interfaces/PlanRepository';

export type ListAllPlansInput = z.output<typeof adminListPlansQuerySchema>;

/** Operator: every plan (predefined and each account's custom plans) with owner and usage counts. */
export class ListAllPlansQuery {
  constructor(private readonly plans: PlanRepository) {}

  async execute(input: ListAllPlansInput): Promise<PaginatedResponse<AdminPlanListItem>> {
    const { rows, total } = await this.plans.listAll(
      { search: input.search, scope: input.scope, kind: input.kind, ownerAccountId: input.ownerAccountId, sort: input.sort, order: input.order },
      pageWindow(input.page, input.pageSize),
    );
    return toPage(rows, total, input.page, input.pageSize, (row) => ({
      ...toPlanDto(row.plan),
      ownerAccountName: row.ownerAccountName,
      assignedAccounts: row.assignedAccounts,
      assignedUsers: row.assignedUsers,
    }));
  }
}
