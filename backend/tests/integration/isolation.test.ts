import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { consume, consumeOk, createAccount, createPlan, createTestContext, keyHeaders, registerUser, type TestContext } from '../support/testApp';

let ctx: TestContext;
let keyA: string;
let keyB: string;
let planB: string;
let recordB: string;

beforeAll(async () => {
  ctx = await createTestContext();
  keyA = (await createAccount(ctx.app)).apiKey;
  keyB = (await createAccount(ctx.app)).apiKey;
  await registerUser(ctx.app, keyA, 'alice');
  await registerUser(ctx.app, keyB, 'bob-of-b');
  planB = (await createPlan(ctx.app, keyB, { scope: 'user', monthlyAllowance: 500, maxUnitsPerRequest: 50 })).id;
  recordB = (await consumeOk(ctx.app, keyB, { userId: 'bob-of-b', units: 7 })).usageRecordId;
});
afterAll(async () => ctx.close());

/** Account A must not see or change anything of account B - and must get 404, never 403. */
describe('account isolation', () => {
  it("cannot read another account's user", async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/users/bob-of-b', headers: keyHeaders(keyA) });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'USER_NOT_FOUND' } });
  });

  it("cannot consume on behalf of another account's user", async () => {
    const response = await consume(ctx.app, keyA, { userId: 'bob-of-b', units: 1 });
    expect(response.statusCode).toBe(404);
  });

  it("cannot see, update or assign another account's custom plan", async () => {
    expect((await ctx.app.inject({ method: 'GET', url: `/api/v1/plans/${planB}`, headers: keyHeaders(keyA) })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'PATCH', url: `/api/v1/plans/${planB}`, headers: keyHeaders(keyA), payload: { monthlyAllowance: 1 } })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'PUT', url: '/api/v1/users/alice/plan', headers: keyHeaders(keyA), payload: { planId: planB } })).statusCode).toBe(404);
    const list = await ctx.app.inject({ method: 'GET', url: '/api/v1/plans?pageSize=100', headers: keyHeaders(keyA) });
    expect(list.json().items.map((plan: { id: string }) => plan.id)).not.toContain(planB);
  });

  it("cannot read another account's usage records or history", async () => {
    expect((await ctx.app.inject({ method: 'GET', url: `/api/v1/usage/${recordB}`, headers: keyHeaders(keyA) })).statusCode).toBe(404);
    const history = await ctx.app.inject({ method: 'GET', url: '/api/v1/usage', headers: keyHeaders(keyA) });
    expect(history.json().totalItems).toBe(0);
    // A client-supplied accountId is ignored: the key decides the account.
    const sneaky = await ctx.app.inject({ method: 'GET', url: '/api/v1/usage?accountId=00000000-0000-4000-8000-0000000000a1', headers: keyHeaders(keyA) });
    expect(sneaky.json().totalItems).toBe(0);
  });

  it('keeps usage totals separate', async () => {
    await consumeOk(ctx.app, keyA, { userId: 'alice', units: 3 });
    const a = await ctx.app.inject({ method: 'GET', url: '/api/v1/account', headers: keyHeaders(keyA) });
    const b = await ctx.app.inject({ method: 'GET', url: '/api/v1/account', headers: keyHeaders(keyB) });
    expect(a.json().quota.consumed).toBe(3);
    expect(b.json().quota.consumed).toBe(7);
  });

  it('allows the same externalUserId in different accounts', async () => {
    await registerUser(ctx.app, keyB, 'alice');
    const response = await consumeOk(ctx.app, keyB, { userId: 'alice', units: 2 });
    expect(response.user.consumed).toBe(2);
  });
});
