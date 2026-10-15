import type { QuotaStatus, RuleCode, RuleLevel } from '@/contracts';

export type { QuotaSnapshot, QuotaStatus, QuotasOverview, RuleCode, RuleLevel, RuleViolation } from '@/contracts';
export {
  APPROACHING_LIMIT_THRESHOLD_PERCENT,
  QUOTA_STATUSES,
  RULE_CODES,
  RULE_EVALUATION_ORDER,
  RULE_LEVELS,
} from '@/contracts';

export const RULE_LABELS: Record<RuleCode, string> = {
  MAX_UNITS_PER_REQUEST: 'Max units per request',
  MONTHLY_ALLOWANCE: 'Monthly allowance',
};

export const LEVEL_LABELS: Record<RuleLevel, string> = {
  account: 'Account (shared)',
  user: 'User (individual)',
};

export const STATUS_LABELS: Record<QuotaStatus, string> = {
  ok: 'Healthy',
  warning: 'Approaching limit',
  exhausted: 'Exhausted',
  over_allowance: 'Over allowance',
};
