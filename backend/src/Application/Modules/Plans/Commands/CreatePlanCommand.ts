import type { CreatePlanRequest, PlanDetails } from '../../../../contracts';
import type { Clock } from '../../../Common/Clock';
import { toPlanDetails } from '../DTOs/planMapping';
import type { PlanRepository } from '../Interfaces/PlanRepository';

/** POST /plans - a custom plan owned by the calling account, starting at version 1. */
export class CreatePlanCommand {
  constructor(
    private readonly plans: PlanRepository,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string, request: CreatePlanRequest): Promise<PlanDetails> {
    const plan = await this.plans.create({
      name: request.name,
      description: request.description ?? null,
      scope: request.scope,
      ownerAccountId: accountId,
      limits: { monthlyAllowance: request.monthlyAllowance, maxUnitsPerRequest: request.maxUnitsPerRequest },
      createdAt: this.clock.now(),
    });
    return toPlanDetails(plan, [plan.currentVersion], { accounts: 0, users: 0 });
  }
}
