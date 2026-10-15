import type { QuotaPeriod } from '../../../../Domain/Quotas/QuotaPeriod';

/**
 * Monthly counters at both levels: (account, period) and (user, period).
 * The lock methods must be called in this order - account first, then user - by every writer,
 * so concurrent consumers never deadlock.
 */
export interface QuotaRepository {
  /**
   * SELECT consumed ... FOR UPDATE on the account counter. The first request of a month creates
   * the row (INSERT ... ON CONFLICT DO NOTHING) and then locks it.
   */
  lockAccountCounter(accountId: string, period: QuotaPeriod): Promise<number>;
  /** Same as lockAccountCounter, for the user counter. Always called after lockAccountCounter. */
  lockUserCounter(userId: string, period: QuotaPeriod): Promise<number>;
  /** Adds units to both (already locked) counters in one statement; returns the new values. */
  increment(accountId: string, userId: string, period: QuotaPeriod, units: number): Promise<{ accountConsumed: number; userConsumed: number }>;
  /** Plain read without locks (dry run). */
  readConsumed(accountId: string, userId: string, period: QuotaPeriod): Promise<{ accountConsumed: number; userConsumed: number }>;
}
