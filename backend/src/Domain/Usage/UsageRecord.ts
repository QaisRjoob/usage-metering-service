import type { RuleCode, RuleLevel, RuleViolation, UsageOutcome } from '../../contracts';
import type { QuotaPeriod } from '../Quotas/QuotaPeriod';

/**
 * One consume request and its outcome. Accepted and rejected requests are both stored; the row is
 * also the idempotency record (UNIQUE account_id + request_id). It keeps the plan versions that
 * governed the decision and the counter values right after it, so a replay can return exactly the
 * original answer.
 */
export interface UsageRecord {
  id: string;
  accountId: string;
  userId: string;
  externalUserId: string;
  requestId: string;
  unitsRequested: number;
  outcome: UsageOutcome;
  rejectionRule: RuleCode | null;
  rejectionLevel: RuleLevel | null;
  violations: RuleViolation[];
  accountPlanVersionId: string;
  userPlanVersionId: string;
  accountConsumedAfter: number;
  userConsumedAfter: number;
  period: QuotaPeriod;
  createdAt: Date;
  correlationId: string | null;
  replayCount: number;
}

/** The idempotency fingerprint: the same requestId must always come with the same user and units. */
export function matchesFingerprint(record: Pick<UsageRecord, 'externalUserId' | 'unitsRequested'>, request: { userId: string; units: number }): boolean {
  return record.externalUserId === request.userId && record.unitsRequested === request.units;
}
