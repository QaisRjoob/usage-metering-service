import {
  APPROACHING_LIMIT_THRESHOLD_PERCENT,
  RULE_EVALUATION_ORDER,
  type QuotaStatus,
  type RuleLevel,
  type RuleViolation,
} from '../../contracts';
import type { UsageDecision } from '../Usage/UsageDecision';

/** The limits of one plan version. */
export interface QuotaLimits {
  monthlyAllowance: number;
  maxUnitsPerRequest: number;
}

/** Everything the policy needs to know about one level when evaluating a request. */
export interface LevelState {
  planName: string;
  limits: QuotaLimits;
  /** Units already consumed at this level in the current period. */
  consumed: number;
}

export interface QuotaNumbers {
  remaining: number;
  utilizationPercent: number;
  status: QuotaStatus;
}

/**
 * remaining   = max(0, allowance - consumed) - never negative
 * utilization = consumed / allowance * 100, rounded to 1 decimal; can exceed 100 when the
 *               allowance was reduced below existing usage. An allowance of 0 counts as 100 %.
 */
export function computeQuotaNumbers(monthlyAllowance: number, consumed: number): QuotaNumbers {
  const remaining = Math.max(0, monthlyAllowance - consumed);
  const utilizationPercent = monthlyAllowance === 0 ? 100 : Math.round((consumed * 1000) / monthlyAllowance) / 10;
  let status: QuotaStatus;
  if (consumed > monthlyAllowance) status = 'over_allowance';
  else if (remaining === 0) status = 'exhausted';
  else if (utilizationPercent >= APPROACHING_LIMIT_THRESHOLD_PERCENT) status = 'warning';
  else status = 'ok';
  return { remaining, utilizationPercent, status };
}

function checkRule(rule: RuleViolation['rule'], level: RuleLevel, state: LevelState, units: number): RuleViolation | null {
  if (rule === 'MAX_UNITS_PER_REQUEST') {
    if (units <= state.limits.maxUnitsPerRequest) return null;
    return {
      rule,
      level,
      limit: state.limits.maxUnitsPerRequest,
      requested: units,
      remaining: null,
      message: `Requested ${units} units, but the ${level} plan "${state.planName}" allows at most ${state.limits.maxUnitsPerRequest} per request.`,
    };
  }
  const remaining = Math.max(0, state.limits.monthlyAllowance - state.consumed);
  if (units <= remaining) return null;
  return {
    rule,
    level,
    limit: state.limits.monthlyAllowance,
    requested: units,
    remaining,
    message: `Requested ${units} units, but only ${remaining} of the ${state.limits.monthlyAllowance} monthly units remain at the ${level} level.`,
  };
}

/**
 * Two-level evaluation. Every rule of both plans is checked in RULE_EVALUATION_ORDER:
 *   1. user MAX_UNITS_PER_REQUEST   2. account MAX_UNITS_PER_REQUEST
 *   3. user MONTHLY_ALLOWANCE        4. account MONTHLY_ALLOWANCE
 * The request is accepted only if no rule fails; the first failure is the reported rejection.
 * Pure function: it never changes counters (the caller does that, atomically).
 */
export function evaluateRequest(units: number, levels: { account: LevelState; user: LevelState }): UsageDecision {
  const violations: RuleViolation[] = [];
  for (const { rule, level } of RULE_EVALUATION_ORDER) {
    const violation = checkRule(rule, level, levels[level], units);
    if (violation) violations.push(violation);
  }
  const [first] = violations;
  return first ? { accepted: false, rejection: first, violations } : { accepted: true, rejection: null, violations: [] };
}
