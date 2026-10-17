import { describe, expect, it } from 'vitest';
import { loadConfig, securityWarnings } from '../../src/config/env';
import { AuthFailureLimiter } from '../../src/Shared/Middleware/authFailureLimiter';

describe('AuthFailureLimiter', () => {
  it('blocks after the limit within the window and forgets after it', () => {
    let now = 0;
    const limiter = new AuthFailureLimiter(2, 60_000, () => now);
    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(false);
    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(true);
    expect(limiter.isBlocked('b')).toBe(false);
    now = 60_000;
    expect(limiter.isBlocked('a')).toBe(false);
  });

  it('keeps memory bounded', () => {
    const limiter = new AuthFailureLimiter(1, 60_000, () => 0, 2);
    limiter.recordFailure('a');
    limiter.recordFailure('b');
    limiter.recordFailure('c');
    expect(limiter.isBlocked('a')).toBe(false);
    expect(limiter.isBlocked('c')).toBe(true);
  });
});

describe('securityWarnings', () => {
  const base = { DATABASE_URL: 'postgres://x', ADMIN_API_TOKEN: 'local-admin-token-change-me' };

  it('stays quiet outside production', () => {
    expect(securityWarnings(loadConfig({ ...base, NODE_ENV: 'development' }))).toEqual([]);
  });

  it('flags demo secrets and demo data in production', () => {
    const warnings = securityWarnings(loadConfig({ ...base, NODE_ENV: 'production', SEED_DEMO_DATA: 'true' }));
    expect(warnings).toHaveLength(2);
    expect(securityWarnings(loadConfig({ ...base, NODE_ENV: 'production', SEED_DEMO_DATA: 'false', ADMIN_API_TOKEN: 'x'.repeat(48) }))).toEqual([]);
  });

  it('does not trust proxy headers unless configured', () => {
    expect(loadConfig(base).TRUST_PROXY_HOPS).toBe(0);
  });
});
