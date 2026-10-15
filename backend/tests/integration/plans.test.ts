import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PREDEFINED_PLAN_IDS,
  consumeOk,
  createAccount,
  createPlan,
  createTestContext,
  keyHeaders,
  registerUser,
  setupWorkedExampleAccount,
  type TestContext,
} from '../support/testApp';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());

const patch = (apiKey: string, planId: string, payload: object) =>
  ctx.app.inject({ method: 'PATCH', url: `/api/v1/plans/${planId}`, headers: keyHeaders(apiKey), payload });

describe('predefined and custom plans', () => {
  it('lists the four predefined plans with the documented limits', async () => {
    const { apiKey } = await createAccount(ctx.app);
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/plans?kind=predefined', headers: keyHeaders(apiKey) });
    const plans = response.json().items.map((plan: { name: string; scope: string; currentVersion: { monthlyAllowance: number; maxUnitsPerRequest: number } }) => [
      plan.name,
      plan.scope,
      plan.currentVersion.monthlyAllowance,
      plan.currentVersion.maxUnitsPerRequest,
    ]);
    expect(plans).toEqual([
      ['Pro', 'account', 100_000, 500],
      ['Starter', 'account', 10_000, 100],
      ['Basic', 'user', 1_000, 20],
      ['Premium', 'user', 10_000, 200],
    ]);
  });

  it('predefined plans are read-only (403 PLAN_READ_ONLY)', async () => {
    const { apiKey } = await createAccount(ctx.app);
    const response = await patch(apiKey, PREDEFINED_PLAN_IDS.basic, { monthlyAllowance: 5 });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'PLAN_READ_ONLY' } });
  });

  it('rejects plan scope mismatches with 422 (and the database enforces it too)', async () => {
    const { apiKey, account } = await createAccount(ctx.app);
    await registerUser(ctx.app, apiKey, 'alice');
    const userOnAccountPlan = await ctx.app.inject({ method: 'PUT', url: '/api/v1/users/alice/plan', headers: keyHeaders(apiKey), payload: { planId: PREDEFINED_PLAN_IDS.pro } });
    expect(userOnAccountPlan.statusCode).toBe(422);
    const accountOnUserPlan = await ctx.app.inject({ method: 'PUT', url: '/api/v1/account/plan', headers: keyHeaders(apiKey), payload: { planId: PREDEFINED_PLAN_IDS.basic } });
    expect(accountOnUserPlan.json()).toMatchObject({ error: { code: 'PLAN_SCOPE_MISMATCH' } });
    await expect(ctx.pool.query('UPDATE accounts SET plan_id = $2 WHERE id = $1', [account.id, PREDEFINED_PLAN_IDS.basic])).rejects.toThrow();
  });

  it('rejects duplicate custom plan names within an account (409)', async () => {
    const { apiKey } = await createAccount(ctx.app);
    await createPlan(ctx.app, apiKey, { scope: 'user', monthlyAllowance: 10, maxUnitsPerRequest: 5, name: 'Team' });
    const response = await ctx.app.inject({ method: 'POST', url: '/api/v1/plans', headers: keyHeaders(apiKey), payload: { name: 'team', scope: 'user', monthlyAllowance: 1, maxUnitsPerRequest: 1 } });
    expect(response.statusCode).toBe(409);
  });
});

describe('plan changes', () => {
  it('a limit change creates a new version that applies to the next request', async () => {
    const { apiKey, userPlan } = await setupWorkedExampleAccount(ctx.app);
    expect((await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 25 })).accepted).toBe(false);
    const updated = await patch(apiKey, userPlan.id, { maxUnitsPerRequest: 50 });
    expect(updated.json()).toMatchObject({ currentVersion: { version: 2, maxUnitsPerRequest: 50 }, versions: [{ version: 2 }, { version: 1 }] });
    const decision = await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 25 });
    expect(decision.accepted).toBe(true);
    expect(decision.user.planVersion).toBe(2);
  });

  it('renaming does not create a version', async () => {
    const { apiKey, userPlan } = await setupWorkedExampleAccount(ctx.app);
    const response = await patch(apiKey, userPlan.id, { name: 'Renamed plan' });
    expect(response.json()).toMatchObject({ name: 'Renamed plan', currentVersion: { version: 1 } });
  });

  it('switching plans keeps consumed units (no fresh allowance)', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 20 });
    const switched = await ctx.app.inject({ method: 'PUT', url: '/api/v1/users/alice/plan', headers: keyHeaders(apiKey), payload: { planId: PREDEFINED_PLAN_IDS.premium } });
    expect(switched.json()).toMatchObject({ plan: { name: 'Premium' }, quota: { consumed: 20, remaining: 9_980 } });
    // 90 > Basic's 20 per request, within Premium's 200 and the account's 100.
    const decision = await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 90 });
    expect(decision).toMatchObject({ accepted: true, user: { consumed: 110 } });
  });

  it('reducing an allowance below usage shows 0 remaining, over_allowance, and rejects further consumption', async () => {
    const { apiKey, userPlan } = await setupWorkedExampleAccount(ctx.app);
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 20 });
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 20 });
    await patch(apiKey, userPlan.id, { monthlyAllowance: 30 });
    const user = await ctx.app.inject({ method: 'GET', url: '/api/v1/users/alice', headers: keyHeaders(apiKey) });
    expect(user.json().quota).toMatchObject({ consumed: 40, remaining: 0, status: 'over_allowance', utilizationPercent: 133.3 });
    const decision = await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 1 });
    expect(decision.rejection).toMatchObject({ rule: 'MONTHLY_ALLOWANCE', level: 'user', remaining: 0 });
    // A later increase makes units available again.
    await patch(apiKey, userPlan.id, { monthlyAllowance: 100 });
    expect((await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 1 })).accepted).toBe(true);
  });

  it('history keeps the plan version that governed each decision', async () => {
    const { apiKey, accountPlan } = await setupWorkedExampleAccount(ctx.app);
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 5 });
    await patch(apiKey, accountPlan.id, { monthlyAllowance: 20_000 });
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 5 });
    const history = await ctx.app.inject({ method: 'GET', url: '/api/v1/usage', headers: keyHeaders(apiKey) });
    const versions = history.json().items.map((record: { accountPlan: { version: number } }) => record.accountPlan.version);
    expect(versions).toEqual([2, 1]);
  });

  it("updating an account's custom plan affects every user of that account", async () => {
    const { apiKey, accountPlan } = await setupWorkedExampleAccount(ctx.app, { accountMonthly: 10, accountPerRequest: 100, userMonthly: 1_000, userPerRequest: 20 });
    expect((await consumeOk(ctx.app, apiKey, { userId: 'bob', units: 15 })).rejection?.level).toBe('account');
    await patch(apiKey, accountPlan.id, { monthlyAllowance: 100 });
    expect((await consumeOk(ctx.app, apiKey, { userId: 'bob', units: 15 })).accepted).toBe(true);
    expect((await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 15 })).accepted).toBe(true);
  });
});
