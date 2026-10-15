import { assertAssignableTo, assertVisibleTo } from '../../../../Domain/Plans/Plan';
import { userNotFound } from '../../../../Domain/Users/UsageSubject';
import type { Clock } from '../../../Common/Clock';
import type { TransactionManager } from '../../../Common/TransactionManager';

/**
 * PUT /users/:userId/plan - switches a user's plan. Consumed units stay (counters are per user and
 * month); the new limits apply to the next request.
 */
export class AssignUserPlanCommand {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string, externalUserId: string, planId: string): Promise<void> {
    await this.transactions.run(async (repos) => {
      const user = await repos.users.findByExternalId(accountId, externalUserId);
      if (!user) throw userNotFound(externalUserId);
      const plan = assertVisibleTo(await repos.plans.findById(planId), accountId);
      assertAssignableTo(plan, 'user');
      await repos.users.updatePlan(user.id, plan.id, this.clock.now());
    });
  }
}
