import { z } from 'zod';
import { externalUserIdSchema, requestIdSchema, unitsSchema } from './common';
import type { QuotaSnapshot, RuleViolation } from './quota';

/**
 * POST /usage/consume
 * `userId` is the caller's externalUserId. `requestId` is the idempotency key, scoped to the account.
 */
export const consumeRequestSchema = z.object({
  userId: externalUserIdSchema,
  units: unitsSchema,
  requestId: requestIdSchema,
});
export type ConsumeRequest = z.infer<typeof consumeRequestSchema>;

/**
 * Outcome of a consume request. A rejection is a valid business decision and is returned with
 * HTTP 200 and `accepted: false`. A rejection consumes nothing.
 */
export interface ConsumeDecision {
  usageRecordId: string;
  requestId: string;
  userId: string;
  units: number;
  accepted: boolean;
  /** First failing rule in RULE_EVALUATION_ORDER; null when accepted. */
  rejection: RuleViolation | null;
  /** Every failing rule, in evaluation order. */
  violations: RuleViolation[];
  /** Account (shared) quota after the decision. */
  account: QuotaSnapshot;
  /** User (individual) quota after the decision. */
  user: QuotaSnapshot;
  period: string;
  processedAt: string;
  /** true when this response replays a stored decision for the same requestId. Nothing was consumed again. */
  idempotentReplay: boolean;
}

/** POST /quotas/check - dry run. Never modifies counters and is never recorded. */
export const quotaCheckRequestSchema = z.object({
  userId: externalUserIdSchema,
  units: unitsSchema,
});
export type QuotaCheckRequest = z.infer<typeof quotaCheckRequestSchema>;

export interface QuotaCheckResult {
  dryRun: true;
  allowed: boolean;
  rejection: RuleViolation | null;
  violations: RuleViolation[];
  /** Current quota state (unchanged by the check). */
  account: QuotaSnapshot;
  user: QuotaSnapshot;
  period: string;
  evaluatedAt: string;
}
