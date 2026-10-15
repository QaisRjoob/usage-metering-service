import { randomUUID } from 'node:crypto';
import type { ConsumeDecision, ConsumeRequest } from '../../../../contracts';
import { evaluateRequest } from '../../../../Domain/Quotas/QuotaPolicy';
import { periodOf } from '../../../../Domain/Quotas/QuotaPeriod';
import { userNotFound } from '../../../../Domain/Users/UsageSubject';
import { idempotencyKeyReused } from '../../../../Domain/Usage/UsageErrors';
import { matchesFingerprint, type UsageRecord } from '../../../../Domain/Usage/UsageRecord';
import type { Clock } from '../../../Common/Clock';
import type { Repositories, TransactionManager } from '../../../Common/TransactionManager';
import { toQuotaSnapshot } from '../../Quotas/DTOs/quotaMapping';

export interface ConsumeContext {
  accountId: string;
  correlationId: string | null;
}

/**
 * POST /usage/consume - the concurrency-critical use case.
 *
 * Everything happens in ONE transaction:
 *   1. advisory lock on (account, requestId)  -> concurrent retries of the same request wait here
 *   2. idempotency lookup                     -> replay the stored decision, or 409 on a different payload
 *   3. lock the account counter, then the user counter (fixed order, so no deadlocks)
 *   4. read both current plan versions AFTER the locks, so a plan change committed before is seen
 *   5. evaluate both plans (pure domain policy)
 *   6. if accepted, add the units to both counters
 *   7. store the decision (accepted or rejected) - it is also the idempotency record
 * Any failure rolls back all of it: no partial consumption, no counter without a record.
 */
export class ConsumeUnitsCommand {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  execute(request: ConsumeRequest, context: ConsumeContext): Promise<ConsumeDecision> {
    return this.transactions.run(async (repos) => {
      await repos.usage.lockRequestId(context.accountId, request.requestId);

      const existing = await repos.usage.findByRequestId(context.accountId, request.requestId);
      if (existing) {
        if (!matchesFingerprint(existing, request)) throw idempotencyKeyReused(request.requestId);
        await repos.usage.markReplayed(existing.id, this.clock.now());
        return this.decisionFromRecord(repos, existing, true);
      }

      const user = await repos.users.findByExternalId(context.accountId, request.userId);
      if (!user) throw userNotFound(request.userId);

      const now = this.clock.now();
      const period = periodOf(now);
      const accountConsumed = await repos.quotas.lockAccountCounter(context.accountId, period);
      const userConsumed = await repos.quotas.lockUserCounter(user.id, period);

      const { account: accountPlan, user: userPlan } = await repos.plans.currentVersions(context.accountId, user.id);

      const decision = evaluateRequest(request.units, {
        account: { planName: accountPlan.planName, limits: accountPlan, consumed: accountConsumed },
        user: { planName: userPlan.planName, limits: userPlan, consumed: userConsumed },
      });

      const after = decision.accepted
        ? await repos.quotas.increment(context.accountId, user.id, period, request.units)
        : { accountConsumed, userConsumed };

      const record: UsageRecord = {
        id: randomUUID(),
        accountId: context.accountId,
        userId: user.id,
        externalUserId: user.externalUserId,
        requestId: request.requestId,
        unitsRequested: request.units,
        outcome: decision.accepted ? 'accepted' : 'rejected',
        rejectionRule: decision.rejection?.rule ?? null,
        rejectionLevel: decision.rejection?.level ?? null,
        violations: decision.violations,
        accountPlanVersionId: accountPlan.planVersionId,
        userPlanVersionId: userPlan.planVersionId,
        accountConsumedAfter: after.accountConsumed,
        userConsumedAfter: after.userConsumed,
        period,
        createdAt: now,
        correlationId: context.correlationId,
        replayCount: 0,
      };
      await repos.usage.insert(record);

      return {
        usageRecordId: record.id,
        requestId: record.requestId,
        userId: user.externalUserId,
        units: record.unitsRequested,
        accepted: decision.accepted,
        rejection: decision.rejection,
        violations: decision.violations,
        account: toQuotaSnapshot('account', period, accountPlan, after.accountConsumed),
        user: toQuotaSnapshot('user', period, userPlan, after.userConsumed),
        period,
        processedAt: now.toISOString(),
        idempotentReplay: false,
      };
    });
  }

  /** Rebuilds the original answer from the stored record: same versions, same counter values. */
  private async decisionFromRecord(repos: Repositories, record: UsageRecord, idempotentReplay: boolean): Promise<ConsumeDecision> {
    const versions = await repos.plans.versionRowsByIds([record.accountPlanVersionId, record.userPlanVersionId]);
    const accountPlan = versions.get(record.accountPlanVersionId);
    const userPlan = versions.get(record.userPlanVersionId);
    if (!accountPlan || !userPlan) throw new Error(`Plan versions of usage record ${record.id} are missing`);
    return {
      usageRecordId: record.id,
      requestId: record.requestId,
      userId: record.externalUserId,
      units: record.unitsRequested,
      accepted: record.outcome === 'accepted',
      rejection: record.violations[0] ?? null,
      violations: record.violations,
      account: toQuotaSnapshot('account', record.period, accountPlan, record.accountConsumedAfter),
      user: toQuotaSnapshot('user', record.period, userPlan, record.userConsumedAfter),
      period: record.period,
      processedAt: record.createdAt.toISOString(),
      idempotentReplay,
    };
  }
}
