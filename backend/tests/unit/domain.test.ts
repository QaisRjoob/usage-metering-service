import { ERROR_CODES } from '../../src/contracts';
import { describe, expect, it } from 'vitest';
import { apiKeyPrefixOf, generateApiKey, hashApiKey, looksLikeApiKey } from '../../src/Domain/Accounts/ApiKey';
import { assertAssignableTo, assertEditable, assertVisibleTo, type Plan } from '../../src/Domain/Plans/Plan';
import { nextLimits } from '../../src/Domain/Plans/PlanVersion';
import { addPeriods, daysInPeriod, periodFromDate, periodOf, periodToDate } from '../../src/Domain/Quotas/QuotaPeriod';
import { matchesFingerprint } from '../../src/Domain/Usage/UsageRecord';
import { HTTP_STATUS_BY_CODE } from '../../src/Shared/Errors/httpStatus';
import { validate } from '../../src/Shared/Validation/validate';
import { consumeRequestSchema } from '../../src/contracts';

const plan = (overrides: Partial<Plan> = {}): Plan => ({
  id: 'p1',
  name: 'Custom',
  description: null,
  scope: 'user',
  isPredefined: false,
  ownerAccountId: 'acct-a',
  currentVersion: { id: 'v1', planId: 'p1', version: 1, monthlyAllowance: 100, maxUnitsPerRequest: 10, createdAt: new Date() },
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('QuotaPeriod (UTC months)', () => {
  it('uses the UTC month of the processing time', () => {
    expect(periodOf(new Date('2026-10-31T23:59:59.999Z'))).toBe('2026-10');
    expect(periodOf(new Date('2026-11-01T00:00:00.000Z'))).toBe('2026-11');
  });
  it('converts to and from the stored DATE and moves across years', () => {
    expect(periodToDate('2026-10')).toBe('2026-10-01');
    expect(periodFromDate('2026-10-01')).toBe('2026-10');
    expect(addPeriods('2026-12', 1)).toBe('2027-01');
    expect(addPeriods('2026-01', -1)).toBe('2025-12');
    expect(daysInPeriod('2028-02')).toBe(29);
  });
});

describe('API keys', () => {
  it('generates high-entropy keys with a display prefix and stores only a hash', () => {
    const first = generateApiKey();
    const second = generateApiKey();
    expect(first.raw).toMatch(/^umk_live_[A-Za-z0-9_-]{43}$/);
    expect(first.raw).not.toBe(second.raw);
    expect(first.hash).toBe(hashApiKey(first.raw));
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).not.toContain(first.raw);
    expect(first.prefix).toBe(apiKeyPrefixOf(first.raw));
    expect(first.prefix).toHaveLength(13);
  });
  it('rejects malformed keys before any lookup', () => {
    expect(looksLikeApiKey('umk_demo_local_only_do_not_use_in_production')).toBe(true);
    expect(looksLikeApiKey('not-a-key')).toBe(false);
    expect(looksLikeApiKey("umk_live_' OR 1=1 --")).toBe(false);
  });
});

describe('plan rules', () => {
  it('predefined plans are read-only', () => {
    expect(() => assertEditable(plan({ isPredefined: true, ownerAccountId: null }))).toThrowError(expect.objectContaining({ code: 'PLAN_READ_ONLY' }));
    expect(() => assertEditable(plan())).not.toThrow();
  });
  it('a user plan cannot go on an account and vice versa', () => {
    expect(() => assertAssignableTo(plan({ scope: 'user' }), 'account')).toThrowError(expect.objectContaining({ code: 'PLAN_SCOPE_MISMATCH' }));
    expect(() => assertAssignableTo(plan({ scope: 'account' }), 'user')).toThrowError(expect.objectContaining({ code: 'PLAN_SCOPE_MISMATCH' }));
  });
  it("another account's custom plan is not found", () => {
    expect(() => assertVisibleTo(plan({ ownerAccountId: 'acct-b' }), 'acct-a')).toThrowError(expect.objectContaining({ code: 'PLAN_NOT_FOUND' }));
    expect(assertVisibleTo(plan({ isPredefined: true, ownerAccountId: null }), 'acct-a').id).toBe('p1');
  });
  it('only a limit change produces a new version', () => {
    const current = { monthlyAllowance: 100, maxUnitsPerRequest: 10 };
    expect(nextLimits(current, {})).toBeNull();
    expect(nextLimits(current, { monthlyAllowance: 100 })).toBeNull();
    expect(nextLimits(current, { monthlyAllowance: 50 })).toEqual({ monthlyAllowance: 50, maxUnitsPerRequest: 10 });
  });
});

describe('idempotency fingerprint', () => {
  it('matches only the same user and units', () => {
    const record = { externalUserId: 'alice', unitsRequested: 10 };
    expect(matchesFingerprint(record, { userId: 'alice', units: 10 })).toBe(true);
    expect(matchesFingerprint(record, { userId: 'alice', units: 11 })).toBe(false);
    expect(matchesFingerprint(record, { userId: 'bob', units: 10 })).toBe(false);
  });
});

describe('validation and error mapping', () => {
  it('maps every documented error code to an HTTP status', () => {
    for (const code of Object.values(ERROR_CODES)) expect(HTTP_STATUS_BY_CODE[code]).toBeGreaterThanOrEqual(400);
    expect(HTTP_STATUS_BY_CODE.API_KEY_INVALID).toBe(401);
    expect(HTTP_STATUS_BY_CODE.USER_NOT_FOUND).toBe(404);
    expect(HTTP_STATUS_BY_CODE.IDEMPOTENCY_KEY_REUSED).toBe(409);
  });
  it.each([0, -1, 2.5, '10', null])('rejects units = %j with VALIDATION_ERROR details', (units) => {
    expect(() => validate(consumeRequestSchema, { userId: 'alice', units, requestId: 'r1' })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_ERROR', details: expect.arrayContaining([expect.objectContaining({ path: 'units' })]) }),
    );
  });
  it('requires a request id', () => {
    expect(() => validate(consumeRequestSchema, { userId: 'alice', units: 1 })).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
});
