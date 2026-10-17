import type { ErrorCode } from '../../contracts';

/** Errors that mean "a credential was presented and it was wrong" (not merely missing or expired). */
export const CREDENTIAL_FAILURE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['TOKEN_INVALID', 'API_KEY_INVALID', 'CREDENTIAL_INVALID', 'SIGNUP_REQUEST_NOT_FOUND']);

/**
 * Throttles credential guessing per client IP: after `maxFailures` wrong credentials (admin token,
 * API key, login token or claim code) within `windowMs`, every request from that IP answers
 * 429 until the window has passed. Correct credentials are never slowed down.
 *
 * In memory and per process, which fits this single-instance service; several instances would
 * share the counters in Redis instead.
 */
export class AuthFailureLimiter {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
    private readonly maxTrackedClients = 50_000,
  ) {}

  isBlocked(client: string): boolean {
    const entry = this.failures.get(client);
    if (!entry) return false;
    if (entry.resetAt <= this.now()) {
      this.failures.delete(client);
      return false;
    }
    return entry.count >= this.maxFailures;
  }

  recordFailure(client: string): void {
    const now = this.now();
    const entry = this.failures.get(client);
    if (entry && entry.resetAt > now) {
      entry.count += 1;
      return;
    }
    // Bounded memory: drop the oldest tracked client before adding a new one.
    if (this.failures.size >= this.maxTrackedClients) this.failures.delete(this.failures.keys().next().value as string);
    this.failures.set(client, { count: 1, resetAt: now + this.windowMs });
  }
}
