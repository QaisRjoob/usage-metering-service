/** The two rule types every plan defines. */
export const RULE_CODES = ['MAX_UNITS_PER_REQUEST', 'MONTHLY_ALLOWANCE'] as const;
export type RuleCode = (typeof RULE_CODES)[number];

/** Which plan a rule belongs to. */
export const RULE_LEVELS = ['account', 'user'] as const;
export type RuleLevel = (typeof RULE_LEVELS)[number];

/**
 * Deterministic evaluation order. The first failing rule is reported as `rejection`;
 * all failing rules are listed in `violations`.
 */
export const RULE_EVALUATION_ORDER: ReadonlyArray<{ rule: RuleCode; level: RuleLevel }> = [
  { rule: 'MAX_UNITS_PER_REQUEST', level: 'user' },
  { rule: 'MAX_UNITS_PER_REQUEST', level: 'account' },
  { rule: 'MONTHLY_ALLOWANCE', level: 'user' },
  { rule: 'MONTHLY_ALLOWANCE', level: 'account' },
];

/** Utilization at or above this percentage counts as "approaching the limit". */
export const APPROACHING_LIMIT_THRESHOLD_PERCENT = 80;

/**
 * ok              utilization below the threshold
 * warning         utilization >= threshold, units still remaining
 * exhausted       remaining is exactly 0 (consumed == allowance)
 * over_allowance  consumed > allowance (the allowance was reduced below existing usage)
 */
export const QUOTA_STATUSES = ['ok', 'warning', 'exhausted', 'over_allowance'] as const;
export type QuotaStatus = (typeof QUOTA_STATUSES)[number];

/** Quota state of one level (account or user) for one UTC month. */
export interface QuotaSnapshot {
  level: RuleLevel;
  period: string;
  planId: string;
  planName: string;
  planVersionId: string;
  planVersion: number;
  monthlyAllowance: number;
  maxUnitsPerRequest: number;
  consumed: number;
  /** max(0, monthlyAllowance - consumed). Never negative. */
  remaining: number;
  /** Actual arithmetic value (consumed / allowance * 100, 1 decimal). Can exceed 100. */
  utilizationPercent: number;
  status: QuotaStatus;
}

/** One rule that a request failed. */
export interface RuleViolation {
  rule: RuleCode;
  level: RuleLevel;
  /** The limit of the failing rule (per-request maximum or monthly allowance). */
  limit: number;
  requested: number;
  /** Units remaining this month at that level (monthly rule only). */
  remaining: number | null;
  message: string;
}
