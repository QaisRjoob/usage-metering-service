import type { CurrentAccountResponse } from '../../../../contracts';
import { accountNotFound } from '../../../../Domain/Accounts/AccountErrors';
import { periodOf } from '../../../../Domain/Quotas/QuotaPeriod';
import type { Clock } from '../../../Common/Clock';
import type { PlanRepository } from '../../Plans/Interfaces/PlanRepository';
import { toPlanDto } from '../../Plans/DTOs/planMapping';
import { toQuotaSnapshot } from '../../Quotas/DTOs/quotaMapping';
import type { AccountRepository } from '../Interfaces/AccountRepository';
import { toAccountSummary } from '../DTOs/accountMapping';

/** GET /account - the calling account, its plan and effective limits, and this month's quota. */
export class GetCurrentAccountQuery {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly plans: PlanRepository,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string): Promise<CurrentAccountResponse> {
    const period = periodOf(this.clock.now());
    const row = await this.accounts.getQuotaRow(accountId, period);
    if (!row) throw accountNotFound();
    const plan = await this.plans.findById(row.plan.planId);
    if (!plan) throw accountNotFound();
    return { account: toAccountSummary(row), plan: toPlanDto(plan), quota: toQuotaSnapshot('account', period, row.plan, row.consumed) };
  }
}
