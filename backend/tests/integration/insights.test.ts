import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminAccountUsageSummary, AdminUserOverview, CompanyStatsResponse } from '../../src/contracts';
import { PREDEFINED_PLAN_IDS, adminHeaders, consumeOk, createAccount, createTestContext, keyHeaders, registerUser, type TestContext } from '../support/testApp';

let ctx: TestContext;
const get = (url: string, headers: Record<string, string> = adminHeaders) => ctx.app.inject({ method: 'GET', url: `/api/v1${url}`, headers });

/** One busy company (two users, one rejection) and one idle company, tagged so searches stay isolated. */
const tag = `ins${randomUUID().slice(0, 6)}`;
let busy: { id: string; apiKey: string };
let idle: { id: string; apiKey: string };

beforeAll(async () => {
  ctx = await createTestContext();
  const first = await createAccount(ctx.app, PREDEFINED_PLAN_IDS.pro);
  const second = await createAccount(ctx.app);
  busy = { id: first.account.id, apiKey: first.apiKey };
  idle = { id: second.account.id, apiKey: second.apiKey };
  await registerUser(ctx.app, busy.apiKey, `${tag}-ana`);
  await registerUser(ctx.app, busy.apiKey, `${tag}-ben`, PREDEFINED_PLAN_IDS.premium);
  await registerUser(ctx.app, busy.apiKey, `${tag}-cy`);
  await registerUser(ctx.app, idle.apiKey, `${tag}-dee`);
  await consumeOk(ctx.app, busy.apiKey, { userId: `${tag}-ana`, units: 10 });
  await consumeOk(ctx.app, busy.apiKey, { userId: `${tag}-ana`, units: 50 }); // Basic: 20 per request -> rejected
  await consumeOk(ctx.app, busy.apiKey, { userId: `${tag}-ben`, units: 30 });
});
afterAll(async () => ctx.close());

describe('operator company statistics page', () => {
  it('returns the company summary with a six-month trend for that company only', async () => {
    const summary = (await get(`/admin/accounts/${busy.id}/usage-summary`)).json() as AdminAccountUsageSummary;
    expect(summary.account.consumed).toBe(40);
    expect(summary.requests).toEqual({ accepted: 2, rejected: 1, unitsRejected: 50 });
    expect(summary.users).toMatchObject({ total: 3 });
    expect(summary.rejectionsByRule).toEqual([{ rule: 'MAX_UNITS_PER_REQUEST', level: 'user', count: 1 }]);
    expect(summary.monthly).toHaveLength(6);
    expect(summary.monthly.at(-1)).toMatchObject({ period: summary.period, unitsConsumed: 40, acceptedRequests: 2, rejectedRequests: 1 });
  });

  it('answers 404 for an unknown company', async () => {
    expect((await get(`/admin/accounts/${randomUUID()}/usage-summary`)).statusCode).toBe(404);
  });
});

describe('operator user overview', () => {
  it('shows one user of a company with plan, quotas, activity and trend', async () => {
    const overview = (await get(`/admin/accounts/${busy.id}/users/${tag}-ana`)).json() as AdminUserOverview;
    expect(overview.account).toEqual({ id: busy.id, name: expect.any(String) });
    expect(overview.user.externalUserId).toBe(`${tag}-ana`);
    expect(overview.plan.name).toBe('Basic');
    expect(overview.quota).toMatchObject({ level: 'user', consumed: 10 });
    expect(overview.accountQuota).toMatchObject({ level: 'account', consumed: 40 });
    expect(overview.activity).toMatchObject({ acceptedRequests: 1, rejectedRequests: 1, lastRequestAt: expect.any(String) });
    expect(overview.monthly.at(-1)).toMatchObject({ unitsConsumed: 10, acceptedRequests: 1, rejectedRequests: 1 });
  });

  it('reports a user without requests and keeps users inside their company', async () => {
    const quiet = (await get(`/admin/accounts/${busy.id}/users/${tag}-cy`)).json() as AdminUserOverview;
    expect(quiet.activity).toEqual({ acceptedRequests: 0, rejectedRequests: 0, lastRequestAt: null });
    expect((await get(`/admin/accounts/${idle.id}/users/${tag}-ana`)).statusCode).toBe(404);
    expect((await get(`/admin/accounts/${busy.id}/users/${tag}-ana`, keyHeaders(busy.apiKey))).statusCode).toBe(401);
  });
});

describe('statistics of every company', () => {
  it('computes usage, requests, rejection rate and active users per company, with totals', async () => {
    const stats = (await get(`/admin/analytics/companies?search=${tag}&sort=consumed&order=desc`)).json() as CompanyStatsResponse;
    expect(stats.totalItems).toBe(2);
    expect(stats.items.map((row) => row.account.id)).toEqual([busy.id, idle.id]);
    const [top] = stats.items;
    expect(top).toMatchObject({ users: 3, activeUsers: 2, requests: { accepted: 2, rejected: 1, unitsRejected: 50 }, rejectionRatePercent: 33.3, isCustomPlan: false });
    expect(top!.quota).toMatchObject({ planName: 'Pro', consumed: 40 });
    expect(top!.shareOfUsagePercent).toBeGreaterThan(0);
    expect(top!.lastRequestAt).toEqual(expect.any(String));
    expect(stats.totals).toMatchObject({ companies: 2, activeCompanies: 1, users: 4, activeUsers: 2, unitsConsumed: 40, acceptedRequests: 2, rejectedRequests: 1, unitsRejected: 50 });
  });

  it('filters by activity and sorts by rejection rate, with pagination', async () => {
    const inactive = (await get(`/admin/analytics/companies?search=${tag}&activity=inactive`)).json() as CompanyStatsResponse;
    expect(inactive.items.map((row) => row.account.id)).toEqual([idle.id]);
    const page = (await get(`/admin/analytics/companies?search=${tag}&sort=rejectionRate&order=asc&pageSize=1&page=2`)).json() as CompanyStatsResponse;
    expect(page).toMatchObject({ totalItems: 2, totalPages: 2, hasPreviousPage: true });
    expect(page.items[0]!.account.id).toBe(busy.id);
    expect((await get('/admin/analytics/companies?sort=apiKey')).statusCode).toBe(400);
  });
});
