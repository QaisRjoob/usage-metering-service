import type { QuotaLimits } from '../Quotas/QuotaPolicy';

/** Immutable revision of a plan's limits. Usage records point at the version that decided them. */
export interface PlanVersion extends QuotaLimits {
  id: string;
  planId: string;
  version: number;
  createdAt: Date;
}

/**
 * Returns the limits of the next version, or null when the patch does not change any limit
 * (renaming a plan does not create a version).
 */
export function nextLimits(current: QuotaLimits, patch: Partial<QuotaLimits>): QuotaLimits | null {
  const next = {
    monthlyAllowance: patch.monthlyAllowance ?? current.monthlyAllowance,
    maxUnitsPerRequest: patch.maxUnitsPerRequest ?? current.maxUnitsPerRequest,
  };
  const changed = next.monthlyAllowance !== current.monthlyAllowance || next.maxUnitsPerRequest !== current.maxUnitsPerRequest;
  return changed ? next : null;
}
