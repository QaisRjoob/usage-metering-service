import type { UserDetails } from '../../../../contracts';
import { accountNotFound } from '../../../../Domain/Accounts/AccountErrors';
import { periodOf } from '../../../../Domain/Quotas/QuotaPeriod';
import { userNotFound } from '../../../../Domain/Users/UsageSubject';
import type { Clock } from '../../../Common/Clock';
import type { AccountRepository } from '../../Accounts/Interfaces/AccountRepository';
import { toPlanDto } from '../../Plans/DTOs/planMapping';
import type { PlanRepository } from '../../Plans/Interfaces/PlanRepository';
import { toQuotaSnapshot } from '../../Quotas/DTOs/quotaMapping';
import { toUserSummary } from '../DTOs/userMapping';
import type { UserRepository } from '../Interfaces/UserRepository';

/** GET /users/:userId - the user, their plan, and both quota levels that apply to them. */
export class GetUserQuery {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly users: UserRepository,
    private readonly plans: PlanRepository,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string, externalUserId: string): Promise<UserDetails> {
    const period = periodOf(this.clock.now());
    const [user, account] = await Promise.all([this.users.getQuotaRow(accountId, externalUserId, period), this.accounts.getQuotaRow(accountId, period)]);
    if (!user) throw userNotFound(externalUserId);
    if (!account) throw accountNotFound();
    const plan = await this.plans.findById(user.plan.planId);
    if (!plan) throw userNotFound(externalUserId);
    return {
      user: toUserSummary(user),
      plan: toPlanDto(plan),
      quota: toQuotaSnapshot('user', period, user.plan, user.consumed),
      accountQuota: toQuotaSnapshot('account', period, account.plan, account.consumed),
    };
  }
}
