import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminUserOverview, PaginatedResponse, UserFacets, UserListItem } from '../../src/contracts';
import { PREDEFINED_PLAN_IDS, adminHeaders, consumeOk, createAccount, createTestContext, keyHeaders, registerUser, type TestContext } from '../support/testApp';

let ctx: TestContext;
let apiKey: string;
let otherKey: string;
let accountId: string;
const get = (url: string, headers: Record<string, string> = keyHeaders(apiKey)) => ctx.app.inject({ method: 'GET', url: `/api/v1${url}`, headers });
const ids = (response: { json: () => unknown }) => (response.json() as PaginatedResponse<UserListItem>).items.map((user) => user.externalUserId);

/** A fresh company: ana (one accepted, one rejected), ben (accepted), cy (no requests). */
beforeAll(async () => {
  ctx = await createTestContext();
  const created = await createAccount(ctx.app, PREDEFINED_PLAN_IDS.pro);
  apiKey = created.apiKey;
  accountId = created.account.id;
  otherKey = (await createAccount(ctx.app)).apiKey;
  await registerUser(ctx.app, apiKey, 'ana');
  await registerUser(ctx.app, apiKey, 'ben', PREDEFINED_PLAN_IDS.premium);
  await registerUser(ctx.app, apiKey, 'cy');
  await registerUser(ctx.app, otherKey, 'ana');
  await consumeOk(ctx.app, apiKey, { userId: 'ana', units: 10 });
  await consumeOk(ctx.app, apiKey, { userId: 'ana', units: 50 }); // Basic: 20 per request -> rejected
  await consumeOk(ctx.app, apiKey, { userId: 'ben', units: 30 });
});
afterAll(async () => ctx.close());

describe('account portal: users list with activity', () => {
  it('returns request activity on each user row', async () => {
    const page = (await get('/users')).json() as PaginatedResponse<UserListItem>;
    const ana = page.items.find((user) => user.externalUserId === 'ana')!;
    expect(ana.activity).toMatchObject({ acceptedRequests: 1, rejectedRequests: 1, lastRequestAt: expect.any(String) });
    expect(page.items.find((user) => user.externalUserId === 'cy')!.activity).toEqual({ acceptedRequests: 0, rejectedRequests: 0, lastRequestAt: null });
  });

  it('filters by activity, rejections and registration date; sorts by rejections and last request', async () => {
    expect(ids(await get('/users?activity=active'))).toEqual(['ana', 'ben']);
    expect(ids(await get('/users?activity=inactive'))).toEqual(['cy']);
    expect(ids(await get('/users?hasRejections=true'))).toEqual(['ana']);
    expect(ids(await get('/users?createdFrom=2000-01-01&createdTo=2000-01-02'))).toEqual([]);
    expect(ids(await get('/users?sort=rejected&order=desc'))[0]).toBe('ana');
    // Users without requests go last in both directions.
    expect(ids(await get('/users?sort=lastActivity&order=asc')).at(-1)).toBe('cy');
    expect(ids(await get('/users?sort=lastActivity&order=desc')).at(-1)).toBe('cy');
  });

  it('applies the same filters on the operator view of the company and on quotas', async () => {
    expect(ids(await get(`/admin/accounts/${accountId}/users?activity=inactive`, adminHeaders))).toEqual(['cy']);
    const quotas = (await get('/quotas?hasRejections=true')).json() as { users: PaginatedResponse<UserListItem> };
    expect(quotas.users.items.map((user) => user.externalUserId)).toEqual(['ana']);
  });

  it('rejects an impossible registration range', async () => {
    expect((await get('/users?createdFrom=2026-10-10&createdTo=2026-10-01')).statusCode).toBe(400);
  });
});

describe('account portal: category counts and user overview', () => {
  it('counts only the caller\'s users per status, plan and activity', async () => {
    const facets = (await get('/account/user-facets')).json() as UserFacets;
    expect(facets).toMatchObject({ total: 3, byActivity: { active: 2, inactive: 1 } });
    expect(facets.byPlan.map((plan) => [plan.planName, plan.count]).sort()).toEqual([
      ['Basic', 2],
      ['Premium', 1],
    ]);
    expect(((await get('/account/user-facets?search=an')).json() as UserFacets).total).toBe(1);
  });

  it('opens one of the caller\'s users with statistics and trend', async () => {
    const overview = (await get('/users/ana/overview')).json() as AdminUserOverview;
    expect(overview.account.id).toBe(accountId);
    expect(overview.requests).toEqual({ accepted: 1, rejected: 1, unitsRejected: 50 });
    expect(overview.activity.lastRequestAt).toEqual(expect.any(String));
    expect(overview.monthly).toHaveLength(6);
    expect(overview.monthly.at(-1)).toMatchObject({ unitsConsumed: 10, acceptedRequests: 1, rejectedRequests: 1 });
  });

  it('keeps every company to its own users', async () => {
    const other = (await get('/users/ana/overview', keyHeaders(otherKey))).json() as AdminUserOverview;
    expect(other.requests).toEqual({ accepted: 0, rejected: 0, unitsRejected: 0 });
    expect((await get('/users/ben/overview', keyHeaders(otherKey))).statusCode).toBe(404);
    expect(((await get('/account/user-facets', keyHeaders(otherKey))).json() as UserFacets).total).toBe(1);
    expect((await get('/account/user-facets', {})).statusCode).toBe(401);
  });
});
