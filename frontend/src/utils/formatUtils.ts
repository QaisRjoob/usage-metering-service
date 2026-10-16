import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { RuleCode, RuleLevel } from '@/models/quota';
import { LEVEL_LABELS, RULE_LABELS } from '@/models/quota';

/** Merges Tailwind class names, letting later classes override earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function shortId(id: string, length = 8): string {
  return id.length <= length ? id : `${id.slice(0, length)}…`;
}

export function describeRule(rule: RuleCode | null, level: RuleLevel | null): string {
  if (!rule || !level) return '—';
  return `${RULE_LABELS[rule]} · ${LEVEL_LABELS[level]}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Generates a request id for idempotent consume calls. */
export function generateRequestId(prefix = 'req'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${random}`;
}

export function maskSecret(secret: string, visible = 10): string {
  return secret.length <= visible ? secret : `${secret.slice(0, visible)}…`;
}

/** Label of a plan category tab: custom plans show their owner. */
export function planFacetLabel(plan: { planName: string; isPredefined: boolean; ownerAccountName: string | null }): string {
  return plan.isPredefined || !plan.ownerAccountName ? plan.planName : `${plan.planName} (${plan.ownerAccountName})`;
}
