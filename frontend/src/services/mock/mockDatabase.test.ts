import { describe, expect, it } from 'vitest';
import { PREDEFINED_PLAN_IDS } from '@/contracts';
import { MockDatabase, computeQuotaNumbers } from './mockDatabase';

/** A small isolated database mirroring the brief's worked example (10,000/100 account, 1,000/20 user). */
function setup(now = new Date('2026-10-15T12:00:00.000Z')) {
  let clock = now;
  const db = new MockDatabase(() => clock);
  const accountPlan = db.createPlan({ name: 'Acct', scope: 'account', isPredefined: false, ownerAccountId: null, monthlyAllowance: 10_000, maxUnitsPerRequest: 100 });
  const userPlan = db.createPlan({ name: 'User', scope: 'user', isPredefined: false, ownerAccountId: null, monthlyAllowance: 1_000, maxUnitsPerRequest: 20 });
  const premium = db.createPlan({ id: PREDEFINED_PLAN_IDS.premium, name: 'Premium', scope: 'user', isPredefined: true, ownerAccountId: null, monthlyAllowance: 10_000, maxUnitsPerRequest: 200 });
  const { row: account } = db.createAccount({ name: 'Doc Co', planId: accountPlan.id });
  const alice = db.createUser({ accountId: account.id, externalUserId: 'alice', planId: userPlan.id });
  const bob = db.createUser({ accountId: account.id, externalUserId: 'bob', planId: userPlan.id });
  return { db, account, alice, bob, accountPlan, userPlan, premium, setNow: (next: Date) => (clock = next) };
}

describe('two-level quota evaluation (brief worked examples)', () => {
  it('rejects 25 units with the user per-request rule even when both monthly allowances have room', () => {
    const { db, account } = setup();
    const decision = db.consume(account, { userId: 'alice', units: 25, requestId: 'r1' });
    expect(decision.accepted).toBe(false);
    expect(decision.rejection).toMatchObject({ rule: 'MAX_UNITS_PER_REQUEST', level: 'user', limit: 20 });
    expect(decision.account.consumed).toBe(0);
    expect(decision.user.consumed).toBe(0);
  });

  it('accepts 10 units and adds 10 at both the user and the account level', () => {
    const { db, account } = setup();
    const decision = db.consume(account, { userId: 'alice', units: 10, requestId: 'r1' });
    expect(decision.accepted).toBe(true);
    expect(decision.user).toMatchObject({ consumed: 10, remaining: 990 });
    expect(decision.account).toMatchObject({ consumed: 10, remaining: 9_990 });
  });

  it('rejects 10 units with the account monthly rule when the account has only 5 left', () => {
    const { db, account, accountPlan } = setup();
    db.updatePlan(accountPlan, { monthlyAllowance: 5 });
    const decision = db.consume(account, { userId: 'alice', units: 10, requestId: 'r1' });
    expect(decision.accepted).toBe(false);
    expect(decision.rejection).toMatchObject({ rule: 'MONTHLY_ALLOWANCE', level: 'account', remaining: 5 });
    expect(decision.user.remaining).toBe(1_000);
  });
});

describe('rule order and violations', () => {
  it('reports the first failing rule in the documented order and lists all failures', () => {
    const { db, account, accountPlan } = setup();
    db.updatePlan(accountPlan, { monthlyAllowance: 10, maxUnitsPerRequest: 15 });
    const decision = db.consume(account, { userId: 'alice', units: 30, requestId: 'r1' });
    expect(decision.violations.map((v) => `${v.level}:${v.rule}`)).toEqual([
      'user:MAX_UNITS_PER_REQUEST',
      'account:MAX_UNITS_PER_REQUEST',
      'account:MONTHLY_ALLOWANCE',
    ]);
    expect(decision.rejection?.level).toBe('user');
  });

  it('users sharing a plan keep separate totals while the account total is their sum', () => {
    const { db, account, alice, bob } = setup();
    db.consume(account, { userId: 'alice', units: 20, requestId: 'a' });
    db.consume(account, { userId: 'bob', units: 15, requestId: 'b' });
    const period = db.currentPeriod();
    expect(db.userConsumed(alice.id, period)).toBe(20);
    expect(db.userConsumed(bob.id, period)).toBe(15);
    expect(db.accountConsumed(account.id, period)).toBe(35);
  });
});

describe('idempotency', () => {
  it('replays the stored decision for the same requestId and payload without consuming again', () => {
    const { db, account } = setup();
    const first = db.consume(account, { userId: 'alice', units: 10, requestId: 'same' });
    const replay = db.consume(account, { userId: 'alice', units: 10, requestId: 'same' });
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.usageRecordId).toBe(first.usageRecordId);
    expect(db.accountConsumed(account.id, db.currentPeriod())).toBe(10);
  });

  it('replays rejected outcomes too', () => {
    const { db, account } = setup();
    db.consume(account, { userId: 'alice', units: 25, requestId: 'rej' });
    const replay = db.consume(account, { userId: 'alice', units: 25, requestId: 'rej' });
    expect(replay).toMatchObject({ accepted: false, idempotentReplay: true });
  });

  it('rejects a reused requestId with a different payload (409 IDEMPOTENCY_KEY_REUSED)', () => {
    const { db, account } = setup();
    db.consume(account, { userId: 'alice', units: 10, requestId: 'k' });
    expect(() => db.consume(account, { userId: 'alice', units: 11, requestId: 'k' })).toThrowError(expect.objectContaining({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' }));
  });
});

describe('plan changes', () => {
  it('a reduced allowance below usage shows 0 remaining, over_allowance, and rejects further consumption', () => {
    const { db, account, userPlan, alice } = setup();
    db.consume(account, { userId: 'alice', units: 20, requestId: 'a' });
    db.consume(account, { userId: 'alice', units: 20, requestId: 'b' });
    db.updatePlan(userPlan, { monthlyAllowance: 30 });
    const snapshot = db.userSnapshot(alice, db.currentPeriod());
    expect(snapshot).toMatchObject({ consumed: 40, remaining: 0, status: 'over_allowance' });
    expect(snapshot.utilizationPercent).toBeCloseTo(133.3, 1);
    const decision = db.consume(account, { userId: 'alice', units: 1, requestId: 'c' });
    expect(decision.rejection).toMatchObject({ rule: 'MONTHLY_ALLOWANCE', level: 'user' });
  });

  it('switching plans keeps consumed units and applies the new limits to the next request', () => {
    const { db, account, alice, premium } = setup();
    db.consume(account, { userId: 'alice', units: 20, requestId: 'a' });
    expect(db.consume(account, { userId: 'alice', units: 25, requestId: 'b' }).accepted).toBe(false);
    alice.planId = premium.id;
    const decision = db.consume(account, { userId: 'alice', units: 25, requestId: 'c' });
    expect(decision.accepted).toBe(true);
    expect(decision.user.consumed).toBe(45);
  });

  it('history keeps the plan version that governed each decision', () => {
    const { db, account, userPlan, setNow } = setup();
    db.consume(account, { userId: 'alice', units: 10, requestId: 'a' });
    db.updatePlan(userPlan, { maxUnitsPerRequest: 50 });
    setNow(new Date('2026-10-15T12:00:01.000Z'));
    db.consume(account, { userId: 'alice', units: 10, requestId: 'b' });
    const [newest, oldest] = db.listUsage({ accountId: account.id }, 1, 10).items;
    expect(oldest?.userPlan.version).toBe(1);
    expect(newest?.userPlan.version).toBe(2);
  });
});

describe('UTC months', () => {
  it('starts each UTC month at zero while keeping the previous month queryable', () => {
    const { db, account, setNow } = setup(new Date('2026-10-31T23:59:59.000Z'));
    db.consume(account, { userId: 'alice', units: 20, requestId: 'oct' });
    setNow(new Date('2026-11-01T00:00:00.000Z'));
    const decision = db.consume(account, { userId: 'alice', units: 5, requestId: 'nov' });
    expect(decision.period).toBe('2026-11');
    expect(decision.account.consumed).toBe(5);
    expect(db.accountConsumed(account.id, '2026-10')).toBe(20);
  });

  it('keeps counters equal to the sum of accepted records', () => {
    const { db, account } = setup();
    for (let index = 0; index < 50; index += 1) db.consume(account, { userId: index % 2 ? 'alice' : 'bob', units: (index % 25) + 1, requestId: `r${index}` });
    expect(db.accountConsumed(account.id, db.currentPeriod())).toBe(db.sumAccepted({ accountId: account.id }));
  });
});

describe('computeQuotaNumbers', () => {
  it('clamps remaining at zero and classifies status', () => {
    expect(computeQuotaNumbers(100, 50)).toEqual({ remaining: 50, utilizationPercent: 50, status: 'ok' });
    expect(computeQuotaNumbers(100, 80).status).toBe('warning');
    expect(computeQuotaNumbers(100, 100)).toMatchObject({ remaining: 0, status: 'exhausted' });
    expect(computeQuotaNumbers(100, 150)).toMatchObject({ remaining: 0, utilizationPercent: 150, status: 'over_allowance' });
    expect(computeQuotaNumbers(0, 0)).toMatchObject({ remaining: 0, utilizationPercent: 100, status: 'exhausted' });
  });
});
