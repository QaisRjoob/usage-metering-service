import type { QuotaSnapshot, RuleLevel } from '../../../../contracts';
import { computeQuotaNumbers } from '../../../../Domain/Quotas/QuotaPolicy';
import type { QuotaPeriod } from '../../../../Domain/Quotas/QuotaPeriod';

/** A plan version as read together with the entity it is assigned to. */
export interface PlanVersionRow {
  planId: string;
  planName: string;
  planVersionId: string;
  planVersion: number;
  monthlyAllowance: number;
  maxUnitsPerRequest: number;
}

export function toQuotaSnapshot(level: RuleLevel, period: QuotaPeriod, plan: PlanVersionRow, consumed: number): QuotaSnapshot {
  return {
    level,
    period,
    planId: plan.planId,
    planName: plan.planName,
    planVersionId: plan.planVersionId,
    planVersion: plan.planVersion,
    monthlyAllowance: plan.monthlyAllowance,
    maxUnitsPerRequest: plan.maxUnitsPerRequest,
    consumed,
    ...computeQuotaNumbers(plan.monthlyAllowance, consumed),
  };
}
