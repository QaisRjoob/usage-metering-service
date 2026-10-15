import { describe, expect, it } from 'vitest';
import { computeQuotaNumbers, evaluateRequest, type LevelState } from '../../src/Domain/Quotas/QuotaPolicy';

const level = (monthlyAllowance: number, maxUnitsPerRequest: number, consumed = 0, planName = 'Plan'): LevelState => ({
  planName,
  limits: { monthlyAllowance, maxUnitsPerRequest },
  consumed,
});

// The brief's example: account 10,000/month & 100/request, user 1,000/month & 20/request.
const account = (consumed = 0) => level(10_000, 100, consumed, 'Account plan');
const user = (consumed = 0) => level(1_000, 20, consumed, 'User plan');

describe('evaluateRequest - worked examples from the brief', () => {
  it('25 units are rejected by the user per-request limit even with monthly room at both levels', () => {
    const decision = evaluateRequest(25, { account: account(), user: user() });
    expect(decision.accepted).toBe(false);
    expect(decision.rejection).toMatchObject({ rule: 'MAX_UNITS_PER_REQUEST', level: 'user', limit: 20, requested: 25 });
  });

  it('10 units are accepted when both levels have enough remaining', () => {
    const decision = evaluateRequest(10, { account: account(), user: user() });
    expect(decision).toEqual({ accepted: true, rejection: null, violations: [] });
  });

  it('10 units are rejected by the account monthly allowance when only 5 remain for the account', () => {
    const decision = evaluateRequest(10, { account: account(9_995), user: user() });
    expect(decision.rejection).toMatchObject({ rule: 'MONTHLY_ALLOWANCE', level: 'account', remaining: 5 });
    expect(decision.violations).toHaveLength(1);
  });
});

describe('evaluateRequest - rule order and boundaries', () => {
  it('reports rules in the documented order: user per-request, account per-request, user monthly, account monthly', () => {
    const decision = evaluateRequest(150, { account: level(100, 120, 0), user: level(100, 20, 0) });
    expect(decision.violations.map((v) => `${v.level}:${v.rule}`)).toEqual([
      'user:MAX_UNITS_PER_REQUEST',
      'account:MAX_UNITS_PER_REQUEST',
      'user:MONTHLY_ALLOWANCE',
      'account:MONTHLY_ALLOWANCE',
    ]);
    expect(decision.rejection?.level).toBe('user');
  });

  it('allows exactly the per-request maximum and exactly the remaining units', () => {
    expect(evaluateRequest(20, { account: account(), user: user(980) }).accepted).toBe(true);
    expect(evaluateRequest(21, { account: account(), user: user() }).accepted).toBe(false);
    expect(evaluateRequest(1, { account: account(), user: user(1_000) }).rejection).toMatchObject({ rule: 'MONTHLY_ALLOWANCE', level: 'user', remaining: 0 });
  });

  it('rejects everything when a monthly allowance is 0', () => {
    expect(evaluateRequest(1, { account: level(0, 10), user: user() }).rejection).toMatchObject({ rule: 'MONTHLY_ALLOWANCE', level: 'account' });
  });

  it('rejects at a level whose allowance was reduced below existing usage', () => {
    const decision = evaluateRequest(1, { account: account(), user: level(50, 20, 80) });
    expect(decision.rejection).toMatchObject({ rule: 'MONTHLY_ALLOWANCE', level: 'user', remaining: 0 });
  });
});

describe('computeQuotaNumbers', () => {
  it('clamps remaining at 0 and keeps the real utilization', () => {
    expect(computeQuotaNumbers(1_000, 250)).toEqual({ remaining: 750, utilizationPercent: 25, status: 'ok' });
    expect(computeQuotaNumbers(1_000, 800)).toEqual({ remaining: 200, utilizationPercent: 80, status: 'warning' });
    expect(computeQuotaNumbers(1_000, 1_000)).toEqual({ remaining: 0, utilizationPercent: 100, status: 'exhausted' });
    expect(computeQuotaNumbers(30, 40)).toEqual({ remaining: 0, utilizationPercent: 133.3, status: 'over_allowance' });
    expect(computeQuotaNumbers(0, 0)).toEqual({ remaining: 0, utilizationPercent: 100, status: 'exhausted' });
  });
});
