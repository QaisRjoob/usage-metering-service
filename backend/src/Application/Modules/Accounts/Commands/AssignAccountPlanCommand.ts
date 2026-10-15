import { assertAssignableTo, assertVisibleTo } from '../../../../Domain/Plans/Plan';
import type { Clock } from '../../../Common/Clock';
import type { TransactionManager } from '../../../Common/TransactionManager';

/**
 * PUT /account/plan - switches the account plan. Units already consumed this month are kept
 * (counters are per account and month, independent of the plan); the new limits apply to the
 * next request.
 */
export class AssignAccountPlanCommand {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string, planId: string): Promise<void> {
    await this.transactions.run(async (repos) => {
      const plan = assertVisibleTo(await repos.plans.findById(planId), accountId);
      assertAssignableTo(plan, 'account');
      await repos.accounts.updatePlan(accountId, plan.id, this.clock.now());
    });
  }
}
