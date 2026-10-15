import type { PlanDetails } from '../../../../contracts';
import { assertVisibleTo } from '../../../../Domain/Plans/Plan';
import { toPlanDetails } from '../DTOs/planMapping';
import type { PlanRepository } from '../Interfaces/PlanRepository';

/** GET /plans/:planId - a plan visible to the account, with every version (newest first). */
export class GetPlanQuery {
  constructor(private readonly plans: PlanRepository) {}

  async execute(accountId: string, planId: string): Promise<PlanDetails> {
    const plan = assertVisibleTo(await this.plans.findById(planId), accountId);
    const [versions, assignments] = await Promise.all([this.plans.listVersions(plan.id), this.plans.countAssignments(plan.id, accountId)]);
    return toPlanDetails(plan, versions, assignments);
  }
}
