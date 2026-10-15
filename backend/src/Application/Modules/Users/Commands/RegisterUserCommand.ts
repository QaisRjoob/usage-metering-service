import { PREDEFINED_PLAN_IDS, type CreateUserRequest, type UserWithQuota } from '../../../../contracts';
import { assertAssignableTo, assertVisibleTo } from '../../../../Domain/Plans/Plan';
import { periodOf } from '../../../../Domain/Quotas/QuotaPeriod';
import type { Clock } from '../../../Common/Clock';
import { toPlanVersionRow } from '../../Plans/DTOs/planMapping';
import type { PlanRepository } from '../../Plans/Interfaces/PlanRepository';
import { toUserWithQuota } from '../DTOs/userMapping';
import type { UserRepository } from '../Interfaces/UserRepository';

/** POST /users - registers a user under the calling account; defaults to the Basic plan. */
export class RegisterUserCommand {
  constructor(
    private readonly users: UserRepository,
    private readonly plans: PlanRepository,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string, request: CreateUserRequest): Promise<UserWithQuota> {
    const plan = assertVisibleTo(await this.plans.findById(request.planId ?? PREDEFINED_PLAN_IDS.basic), accountId);
    assertAssignableTo(plan, 'user');
    const now = this.clock.now();
    const user = await this.users.create({
      accountId,
      externalUserId: request.externalUserId,
      displayName: request.displayName ?? null,
      planId: plan.id,
      createdAt: now,
    });
    return toUserWithQuota({ ...user, plan: toPlanVersionRow(plan), consumed: 0 }, periodOf(now));
  }
}
