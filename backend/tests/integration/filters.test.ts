import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PREDEFINED_PLAN_IDS,
  adminHeaders,
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

const get = (url: string, headers: Record<string, string>) => ctx.app.inject({ method: 'GET', url: `/api/v1${url}`, headers });
const items = <T>(response: { json: () => unknown }) => (response.json() as { items: T[] }).items;

describe('usage history filters and sorting', () => {
  let apiKey: string;
  beforeAll(async () => {
    ({ apiKey } = await setupWorkedExampleAccount(ctx.app, { accountMonthly: 30, accountPerRequest: 100, userMonthly: 1_000, userPerRequest: 20 }));
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 5, requestId: 'inv-001' }); // accepted
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 25, requestId: 'contract-002' }); // user per-request
    await consumeOk(ctx.app, apiKey, { userId: 'bob', units: 20, requestId: 'inv-003' }); // accepted (account 25/30)
    await consumeOk(ctx.app, apiKey, { userId: 'bob', units: 10, requestId: 'report-004' }); // account monthly
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 5, requestId: 'inv-001' }); // replay
  });

  it('filters by rejection rule and level', async () => {
    const user = items<{ requestId: string }>(await get('/usage?rule=MAX_UNITS_PER_REQUEST&level=user', keyHeaders(apiKey)));
    expect(user.map((record) => record.requestId)).toEqual(['contract-002']);
    const account = items<{ requestId: string }>(await get('/usage?level=account', keyHeaders(apiKey)));
    expect(account.map((record) => record.requestId)).toEqual(['report-004']);
  });

  it('filters by units range, request id substring and replay', async () => {
    const big = items<{ unitsRequested: number }>(await get('/usage?minUnits=10&maxUnits=20', keyHeaders(apiKey)));
    expect(big.map((record) => record.unitsRequested).sort()).toEqual([10, 20]);
    const invoices = items<{ requestId: string }>(await get('/usage?requestId=INV', keyHeaders(apiKey)));
    expect(invoices.map((record) => record.requestId).sort()).toEqual(['inv-001', 'inv-003']);
    const replayed = items<{ requestId: string; replayCount: number }>(await get('/usage?replayed=true', keyHeaders(apiKey)));
    expect(replayed).toEqual([expect.objectContaining({ requestId: 'inv-001', replayCount: 1 })]);
    expect((await get('/usage?replayed=false', keyHeaders(apiKey))).json().totalItems).toBe(3);
  });

  it('sorts by units in both directions, with a stable tie-breaker', async () => {
    const asc = items<{ unitsRequested: number }>(await get('/usage?sort=units&order=asc', keyHeaders(apiKey)));
    expect(asc.map((record) => record.unitsRequested)).toEqual([5, 10, 20, 25]);
    const desc = items<{ unitsRequested: number }>(await get('/usage?sort=units&order=desc', keyHeaders(apiKey)));
    expect(desc.map((record) => record.unitsRequested)).toEqual([25, 20, 10, 5]);
  });

  it('combines filters with pagination', async () => {
    const page = (await get('/usage?outcome=accepted&pageSize=1&page=2&sort=units&order=asc', keyHeaders(apiKey))).json();
    expect(page).toMatchObject({ totalItems: 2, totalPages: 2, page: 2, hasPreviousPage: true, hasNextPage: false });
    expect(page.items[0].unitsRequested).toBe(20);
  });
});

describe('users and quotas filters', () => {
  let apiKey: string;
  beforeAll(async () => {
    ({ apiKey } = await setupWorkedExampleAccount(ctx.app));
    await registerUser(ctx.app, apiKey, 'carol', PREDEFINED_PLAN_IDS.premium);
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 20 });
    for (let index = 0; index < 4; index += 1) await consumeOk(ctx.app, apiKey, { userId: 'bob', units: 20 }); // 80 of 1,000 = 8 %
  });

  it('filters by utilization range and sorts by consumption', async () => {
    const busy = items<{ externalUserId: string }>(await get('/users?minUtilization=5', keyHeaders(apiKey)));
    expect(busy.map((user) => user.externalUserId)).toEqual(['bob']);
    const sorted = items<{ externalUserId: string }>(await get('/users?sort=consumed&order=desc', keyHeaders(apiKey)));
    expect(sorted.map((user) => user.externalUserId)).toEqual(['bob', 'alice', 'carol']);
  });

  it('applies the same filters on the quotas overview', async () => {
    const overview = (await get(`/quotas?planId=${PREDEFINED_PLAN_IDS.premium}`, keyHeaders(apiKey))).json();
    expect(overview.users.items.map((user: { externalUserId: string }) => user.externalUserId)).toEqual(['carol']);
  });
});

describe('plans filters', () => {
  it('searches and sorts plans visible to the account', async () => {
    const { apiKey } = await createAccount(ctx.app);
    await createPlan(ctx.app, apiKey, { scope: 'user', monthlyAllowance: 50, maxUnitsPerRequest: 5, name: 'Squad Small' });
    await createPlan(ctx.app, apiKey, { scope: 'user', monthlyAllowance: 5_000, maxUnitsPerRequest: 50, name: 'Squad Large' });
    const squad = items<{ name: string }>(await get('/plans?search=squad&sort=monthlyAllowance&order=desc', keyHeaders(apiKey)));
    expect(squad.map((plan) => plan.name)).toEqual(['Squad Large', 'Squad Small']);
  });
});

describe('operator filters', () => {
  it('filters accounts by plan, plan kind, utilization and creation date; sorts by user count', async () => {
    const pro = await createAccount(ctx.app, PREDEFINED_PLAN_IDS.pro);
    await registerUser(ctx.app, pro.apiKey, 'u1');
    await registerUser(ctx.app, pro.apiKey, 'u2');
    const byPlan = items<{ id: string }>(await get(`/admin/accounts?planId=${PREDEFINED_PLAN_IDS.pro}&pageSize=100`, adminHeaders));
    expect(byPlan.map((account) => account.id)).toContain(pro.account.id);
    const custom = items<{ quota: { planName: string } }>(await get('/admin/accounts?planKind=custom&pageSize=100', adminHeaders));
    expect(custom.every((account) => !['Starter', 'Pro'].includes(account.quota.planName))).toBe(true);
    const today = new Date().toISOString().slice(0, 10);
    const createdToday = items<{ id: string }>(await get(`/admin/accounts?createdFrom=${today}&createdTo=${today}&pageSize=100`, adminHeaders));
    expect(createdToday.map((account) => account.id)).toContain(pro.account.id);
    const idle = items<{ quota: { utilizationPercent: number } }>(await get('/admin/accounts?maxUtilization=0&pageSize=100', adminHeaders));
    expect(idle.every((account) => account.quota.utilizationPercent === 0)).toBe(true);
    const byUsers = items<{ userCount: number }>(await get('/admin/accounts?sort=userCount&order=desc&pageSize=100', adminHeaders));
    const counts = byUsers.map((account) => account.userCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('lists the plan catalogue across accounts with owner and assignment counts', async () => {
    const { apiKey, account } = await createAccount(ctx.app);
    const plan = await createPlan(ctx.app, apiKey, { scope: 'user', monthlyAllowance: 10, maxUnitsPerRequest: 1, name: 'Catalogue probe' });
    await registerUser(ctx.app, apiKey, 'probe', plan.id);
    const owned = items<{ id: string; ownerAccountName: string; assignedUsers: number }>(await get(`/admin/plans?ownerAccountId=${account.id}`, adminHeaders));
    expect(owned).toEqual([expect.objectContaining({ id: plan.id, ownerAccountName: account.name, assignedUsers: 1 })]);
    const predefined = (await get('/admin/plans?kind=predefined', adminHeaders)).json();
    expect(predefined.totalItems).toBe(4);
    expect((await get('/admin/plans', keyHeaders(apiKey))).statusCode).toBe(401);
  });

  it('filters cross-account history by account and rule', async () => {
    const { apiKey, accountId } = await setupWorkedExampleAccount(ctx.app);
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 25 });
    const page = (await get(`/admin/usage?accountId=${accountId}&rule=MAX_UNITS_PER_REQUEST`, adminHeaders)).json();
    expect(page.totalItems).toBe(1);
  });
});

describe('filter validation', () => {
  it.each([
    ['/usage?minUnits=20&maxUnits=10', 'maxUnits'],
    ['/usage?from=2026-10-20&to=2026-10-01', 'to'],
    ['/usage?rule=SOMETHING', 'rule'],
    ['/usage?sort=password', 'sort'],
    ['/usage?replayed=maybe', 'replayed'],
    ['/users?minUtilization=90&maxUtilization=10', 'maxUtilization'],
    ['/plans?sort=owner', 'sort'],
  ])('rejects %s with 400 and the offending field', async (url, field) => {
    const { apiKey } = await createAccount(ctx.app);
    const response = await get(url, keyHeaders(apiKey));
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details.map((issue: { path: string }) => issue.path)).toContain(field);
  });

  it('rejects invalid operator filters', async () => {
    expect((await get('/admin/accounts?createdFrom=2026-10-20&createdTo=2026-10-01', adminHeaders)).statusCode).toBe(400);
    expect((await get('/admin/accounts?sort=apiKey', adminHeaders)).statusCode).toBe(400);
  });
});
