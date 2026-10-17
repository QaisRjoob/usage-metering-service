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
  const base = { DATABASE_URL: 'postgres://x', ADMIN_API_TOKEN: 'local-admin-token-change-me', JWT_SECRET: 'local-jwt-secret-change-me-0123456789abcdef' };

  it('stays quiet outside production', () => {
    expect(securityWarnings(loadConfig({ ...base, NODE_ENV: 'development' }))).toEqual([]);
  });

  it('flags demo secrets, insecure cookies and demo data in production', () => {
    const warnings = securityWarnings(loadConfig({ ...base, NODE_ENV: 'production', SEED_DEMO_DATA: 'true' }));
    expect(warnings.map((warning) => warning.split(' ')[0])).toEqual(['ADMIN_API_TOKEN', 'JWT_SECRET', 'COOKIE_SECURE', 'SEED_DEMO_DATA']);
    const hardened = { ...base, NODE_ENV: 'production', SEED_DEMO_DATA: 'false', ADMIN_API_TOKEN: 'x'.repeat(48), JWT_SECRET: 'y'.repeat(48), COOKIE_SECURE: 'true' };
    expect(securityWarnings(loadConfig(hardened))).toEqual([]);
  });

  it('requires a JWT secret of at least 32 characters', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/);
  });

  it('does not trust proxy headers unless configured', () => {
    expect(loadConfig(base).TRUST_PROXY_HOPS).toBe(0);
  });
});

describe('waitForDatabase', () => {
  it('retries until the database answers, then gives up after the last attempt', async () => {
    const { waitForDatabase } = await import('../../src/Infrastructure/Database/postgres');
    let calls = 0;
    const flaky = { query: async () => (++calls < 3 ? Promise.reject(new Error('ECONNREFUSED')) : { rows: [] }) };
    const retries: number[] = [];
    await waitForDatabase(flaky as never, (attempt) => retries.push(attempt), { attempts: 5, delayMs: 1 });
    expect(retries).toEqual([1, 2]);
    const down = { query: async () => Promise.reject(new Error('down')) };
    await expect(waitForDatabase(down as never, () => {}, { attempts: 2, delayMs: 1 })).rejects.toThrow('down');
  });
});
