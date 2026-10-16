import { APPROACHING_LIMIT_THRESHOLD_PERCENT } from '../../contracts';
import type { PlanVersionRow } from '../../Application/Modules/Quotas/DTOs/quotaMapping';

/**
 * SQL versions of the quota formulas, used only where the database must filter or sort by them
 * (status filters, "highest utilization" lists). They mirror Domain/Quotas/QuotaPolicy.ts
 * computeQuotaNumbers exactly; every value returned to clients is still computed by the domain.
 */
export function utilizationSql(allowance: string, consumed: string): string {
  return `(CASE WHEN ${allowance} = 0 THEN 100 ELSE round(${consumed} * 100.0 / ${allowance}, 1) END)`;
}

export function statusSql(allowance: string, consumed: string): string {
  return `(CASE
    WHEN ${consumed} > ${allowance} THEN 'over_allowance'
    WHEN ${consumed} >= ${allowance} THEN 'exhausted'
    WHEN ${utilizationSql(allowance, consumed)} >= ${APPROACHING_LIMIT_THRESHOLD_PERCENT} THEN 'warning'
    ELSE 'ok' END)`;
}

/** Columns of a joined plan (alias p) + current version (alias pv), read into PlanVersionRow. */
export const PLAN_VERSION_COLUMNS = `
  p.id AS plan_id, p.name AS plan_name, pv.id AS plan_version_id, pv.version AS plan_version,
  pv.monthly_allowance, pv.max_units_per_request`;

export interface PlanVersionColumns {
  plan_id: string;
  plan_name: string;
  plan_version_id: string;
  plan_version: number;
  monthly_allowance: number;
  max_units_per_request: number;
}

export function toPlanVersionRow(row: PlanVersionColumns): PlanVersionRow {
  return {
    planId: row.plan_id,
    planName: row.plan_name,
    planVersionId: row.plan_version_id,
    planVersion: row.plan_version,
    monthlyAllowance: row.monthly_allowance,
    maxUnitsPerRequest: row.max_units_per_request,
  };
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

/** Escapes LIKE wildcards in user-supplied search text. */
export function likePattern(search: string): string {
  return `%${escapeLike(search)}%`;
}

/** "starts with" pattern, used to rank finder results. */
export function prefixPattern(search: string): string {
  return `${escapeLike(search)}%`;
}

/** Collects positional parameters while building a WHERE clause. */
export class SqlParams {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}
