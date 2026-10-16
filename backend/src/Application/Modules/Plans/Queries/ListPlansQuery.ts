import type { PaginatedResponse, Plan, listPlansQuerySchema } from '../../../../contracts';
import type { z } from 'zod';
import { pageWindow, toPage } from '../../../Common/Pagination/pagination';
import { toPlanDto } from '../DTOs/planMapping';
import type { PlanRepository } from '../Interfaces/PlanRepository';

export type ListPlansInput = z.output<typeof listPlansQuerySchema>;

/** GET /plans - predefined plans plus the calling account's own custom plans. */
export class ListPlansQuery {
  constructor(private readonly plans: PlanRepository) {}

  async execute(accountId: string, input: ListPlansInput): Promise<PaginatedResponse<Plan>> {
    const { rows, total } = await this.plans.listVisible(
      accountId,
      { search: input.search, scope: input.scope, kind: input.kind, sort: input.sort, order: input.order },
      pageWindow(input.page, input.pageSize),
    );
    return toPage(rows, total, input.page, input.pageSize, toPlanDto);
  }
}
