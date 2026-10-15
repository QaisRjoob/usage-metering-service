import type { UpdatePlanRequest } from '../../../../contracts';
import { assertEditable, assertVisibleTo } from '../../../../Domain/Plans/Plan';
import { nextLimits } from '../../../../Domain/Plans/PlanVersion';
import type { Clock } from '../../../Common/Clock';
import type { TransactionManager } from '../../../Common/TransactionManager';

/**
 * PATCH /plans/:planId - updates a custom plan. A limit change inserts a new immutable version and
 * points the plan at it, in one transaction with the plan row locked. Every account or user on the
 * plan gets the new limits on their next request; past usage records keep their old version.
 */
export class UpdatePlanCommand {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string, planId: string, request: UpdatePlanRequest): Promise<void> {
    await this.transactions.run(async (repos) => {
      const plan = assertVisibleTo(await repos.plans.findByIdForUpdate(planId), accountId);
      assertEditable(plan);
      await repos.plans.update(plan.id, {
        name: request.name,
        description: request.description,
        limits: nextLimits(plan.currentVersion, { monthlyAllowance: request.monthlyAllowance, maxUnitsPerRequest: request.maxUnitsPerRequest }),
        updatedAt: this.clock.now(),
      });
    });
  }
}
