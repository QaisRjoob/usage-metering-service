import { PREDEFINED_PLAN_IDS, type CreateAccountRequest, type CreateAccountResponse } from '../../../../contracts';
import { generateApiKey } from '../../../../Domain/Accounts/ApiKey';
import { assertAssignableTo } from '../../../../Domain/Plans/Plan';
import { planNotFound } from '../../../../Domain/Plans/PlanErrors';
import { periodOf } from '../../../../Domain/Quotas/QuotaPeriod';
import type { Clock } from '../../../Common/Clock';
import type { PlanRepository } from '../../Plans/Interfaces/PlanRepository';
import { toPlanVersionRow } from '../../Plans/DTOs/planMapping';
import { NO_ACTIVITY, type AccountRepository } from '../Interfaces/AccountRepository';
import { toAccountListItem } from '../DTOs/accountMapping';

/**
 * Operator command: creates an account and issues its API key. The raw key is returned once;
 * only its SHA-256 hash and a display prefix are stored. A new account starts on Starter unless
 * another predefined account plan is requested (custom plans belong to existing accounts).
 */
export class CreateAccountCommand {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly plans: PlanRepository,
    private readonly clock: Clock,
  ) {}

  async execute(request: CreateAccountRequest): Promise<CreateAccountResponse> {
    const plan = await this.plans.findById(request.planId ?? PREDEFINED_PLAN_IDS.starter);
    if (!plan || !plan.isPredefined) throw planNotFound();
    assertAssignableTo(plan, 'account');

    const key = generateApiKey();
    const now = this.clock.now();
    const account = await this.accounts.create({ name: request.name, apiKeyHash: key.hash, apiKeyPrefix: key.prefix, planId: plan.id, createdAt: now });
    const period = periodOf(now);
    return {
      account: toAccountListItem({ ...account, plan: toPlanVersionRow(plan), consumed: 0, userCount: 0, activity: NO_ACTIVITY }, period),
      apiKey: key.raw,
    };
  }
}
