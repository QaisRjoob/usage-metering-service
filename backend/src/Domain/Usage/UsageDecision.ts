import type { RuleViolation } from '../../contracts';

/** Result of evaluating a request against both plans. A rejection always names a rule and level. */
export type UsageDecision =
  | { accepted: true; rejection: null; violations: [] }
  | { accepted: false; rejection: RuleViolation; violations: RuleViolation[] };
