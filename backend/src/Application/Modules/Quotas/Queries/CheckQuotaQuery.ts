import type { QuotaCheckRequest, QuotaCheckResult } from '../../../../contracts';
import { evaluateRequest } from '../../../../Domain/Quotas/QuotaPolicy';
import { periodOf } from '../../../../Domain/Quotas/QuotaPeriod';
import { userNotFound } from '../../../../Domain/Users/UsageSubject';
import type { Clock } from '../../../Common/Clock';
import type { PlanRepository } from '../../Plans/Interfaces/PlanRepository';
import type { UserRepository } from '../../Users/Interfaces/UserRepository';
import type { QuotaRepository } from '../Interfaces/QuotaRepository';
import { toQuotaSnapshot } from '../DTOs/quotaMapping';

/**
 * POST /quotas/check - dry run. Same evaluation as consume, but plain reads: no locks, no counter
 * change, no history record. Advisory only: consume re-checks everything atomically.
 */
export class CheckQuotaQuery {
  constructor(
    private readonly users: UserRepository,
    private readonly plans: PlanRepository,
    private readonly quotas: QuotaRepository,
    private readonly clock: Clock,
  ) {}

  async execute(accountId: string, request: QuotaCheckRequest): Promise<QuotaCheckResult> {
    const user = await this.users.findByExternalId(accountId, request.userId);
    if (!user) throw userNotFound(request.userId);
    const now = this.clock.now();
    const period = periodOf(now);
    const [{ account: accountPlan, user: userPlan }, consumed] = await Promise.all([
      this.plans.currentVersions(accountId, user.id),
      this.quotas.readConsumed(accountId, user.id, period),
    ]);
    const decision = evaluateRequest(request.units, {
      account: { planName: accountPlan.planName, limits: accountPlan, consumed: consumed.accountConsumed },
      user: { planName: userPlan.planName, limits: userPlan, consumed: consumed.userConsumed },
    });
    return {
      dryRun: true,
      allowed: decision.accepted,
      rejection: decision.rejection,
      violations: decision.violations,
      account: toQuotaSnapshot('account', period, accountPlan, consumed.accountConsumed),
      user: toQuotaSnapshot('user', period, userPlan, consumed.userConsumed),
      period,
      evaluatedAt: now.toISOString(),
    };
  }
}
