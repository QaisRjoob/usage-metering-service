import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccountFacets, AccountListItem, AdminSearchResult, AdminUserListItem, UserFacets } from '../../src/contracts';
import { PREDEFINED_PLAN_IDS, adminHeaders, consumeOk, createAccount, createTestContext, keyHeaders, registerUser, type TestContext } from '../support/testApp';

let ctx: TestContext;
const get = (url: string, headers: Record<string, string> = adminHeaders) => ctx.app.inject({ method: 'GET', url: `/api/v1${url}`, headers });
const items = <T>(response: { json: () => unknown }) => (response.json() as { items: T[] }).items;

/**
 * Two companies with a shared, unique tag in their users' ids so the shared test database's other
 * data never matches: "busy" has requests (one rejected), "quiet" has none.
 */
const tag = `dir${randomUUID().slice(0, 6)}`;
let busy: { id: string; apiKeyPrefix: string; apiKey: string };
let quiet: { id: string; apiKeyPrefix: string; apiKey: string };

beforeAll(async () => {
  ctx = await createTestContext();
  const first = await createAccount(ctx.app, PREDEFINED_PLAN_IDS.pro);
  const second = await createAccount(ctx.app);
  busy = { id: first.account.id, apiKeyPrefix: first.account.apiKeyPrefix, apiKey: first.apiKey };
  quiet = { id: second.account.id, apiKeyPrefix: second.account.apiKeyPrefix, apiKey: second.apiKey };
  await registerUser(ctx.app, busy.apiKey, `${tag}-ana`);
  await registerUser(ctx.app, busy.apiKey, `${tag}-ben`, PREDEFINED_PLAN_IDS.premium);
  await registerUser(ctx.app, quiet.apiKey, `${tag}-cy`);
  await consumeOk(ctx.app, busy.apiKey, { userId: `${tag}-ana`, units: 10 });
  await consumeOk(ctx.app, busy.apiKey, { userId: `${tag}-ana`, units: 500 }); // Basic allows 20 per request -> rejected
  await consumeOk(ctx.app, busy.apiKey, { userId: `${tag}-ben`, units: 5 });
});
afterAll(async () => ctx.close());

describe('operator account search and activity', () => {
  it('finds a company by name, id, API key prefix or one of its user ids', async () => {
    for (const search of [busy.id, busy.apiKeyPrefix, `${tag}-ben`]) {
      const found = items<AccountListItem>(await get(`/admin/accounts?search=${encodeURIComponent(search)}`));
      expect(found.map((account) => account.id)).toEqual([busy.id]);
    }
  });

  it('returns activity counts and the last request time on each row', async () => {
    const [row] = items<AccountListItem>(await get(`/admin/accounts?search=${busy.id}`));
    expect(row!.activity).toMatchObject({ acceptedRequests: 2, rejectedRequests: 1 });
    expect(row!.activity.lastRequestAt).toEqual(expect.any(String));
    const [idle] = items<AccountListItem>(await get(`/admin/accounts?search=${quiet.id}`));
    expect(idle!.activity).toEqual({ acceptedRequests: 0, rejectedRequests: 0, lastRequestAt: null });
  });

  it('filters by activity, rejections and user count; sorts by last activity', async () => {
    const scoped = (query: string) => get(`/admin/accounts?search=${tag}&${query}`);
    expect(items<AccountListItem>(await scoped('activity=active')).map((a) => a.id)).toEqual([busy.id]);
    expect(items<AccountListItem>(await scoped('activity=inactive')).map((a) => a.id)).toEqual([quiet.id]);
    expect(items<AccountListItem>(await scoped('hasRejections=true')).map((a) => a.id)).toEqual([busy.id]);
    expect(items<AccountListItem>(await scoped('minUsers=2')).map((a) => a.id)).toEqual([busy.id]);
    expect(items<AccountListItem>(await scoped('maxUsers=1')).map((a) => a.id)).toEqual([quiet.id]);
    // Accounts without requests go last in both directions.
    expect(items<AccountListItem>(await scoped('sort=lastActivity&order=asc')).map((a) => a.id)).toEqual([busy.id, quiet.id]);
    expect(items<AccountListItem>(await scoped('sort=rejected&order=desc')).map((a) => a.id)).toEqual([busy.id, quiet.id]);
  });

  it('counts accounts per status, plan and activity within the search', async () => {
    const facets = (await get(`/admin/accounts/facets?search=${tag}`)).json() as AccountFacets;
    expect(facets.total).toBe(2);
    expect(facets.byActivity).toEqual({ active: 1, inactive: 1 });
    expect(facets.byStatus.ok).toBe(2);
    expect(facets.byPlan.map((plan) => [plan.planName, plan.count]).sort()).toEqual([
      ['Pro', 1],
      ['Starter', 1],
    ]);
  });
});

describe('operator users directory', () => {
  it('lists users of every company with their company and activity', async () => {
    const page = (await get(`/admin/users?search=${tag}&sort=externalUserId&order=asc`)).json() as { items: AdminUserListItem[]; totalItems: number };
    expect(page.totalItems).toBe(3);
    expect(page.items.map((user) => [user.externalUserId, user.account.id])).toEqual([
      [`${tag}-ana`, busy.id],
      [`${tag}-ben`, busy.id],
      [`${tag}-cy`, quiet.id],
    ]);
    expect(page.items[0]!.activity).toMatchObject({ acceptedRequests: 1, rejectedRequests: 1 });
    expect(page.items[0]!.quota).toMatchObject({ level: 'user', consumed: 10, planName: 'Basic' });
  });

  it('filters by company, plan and activity, with pagination', async () => {
    const byAccount = items<AdminUserListItem>(await get(`/admin/users?search=${tag}&accountId=${quiet.id}`));
    expect(byAccount.map((user) => user.externalUserId)).toEqual([`${tag}-cy`]);
    const premium = items<AdminUserListItem>(await get(`/admin/users?search=${tag}&planId=${PREDEFINED_PLAN_IDS.premium}`));
    expect(premium.map((user) => user.externalUserId)).toEqual([`${tag}-ben`]);
    const inactive = items<AdminUserListItem>(await get(`/admin/users?search=${tag}&activity=inactive`));
    expect(inactive.map((user) => user.externalUserId)).toEqual([`${tag}-cy`]);
    const second = (await get(`/admin/users?search=${tag}&sort=rejected&order=desc&pageSize=1&page=2`)).json();
    expect(second).toMatchObject({ totalItems: 3, totalPages: 3, hasNextPage: true, hasPreviousPage: true });
  });

  it('counts users per status, plan and activity', async () => {
    const facets = (await get(`/admin/users/facets?search=${tag}`)).json() as UserFacets;
    expect(facets).toMatchObject({ total: 3, byActivity: { active: 2, inactive: 1 } });
    expect(facets.byPlan.map((plan) => [plan.planName, plan.count]).sort()).toEqual([
      ['Basic', 2],
      ['Premium', 1],
    ]);
  });
});

describe('operator finder', () => {
  it('finds companies by key prefix and users by id, exact matches first', async () => {
    const byPrefix = (await get(`/admin/search?q=${busy.apiKeyPrefix}`)).json() as AdminSearchResult;
    expect(byPrefix.accounts[0]).toMatchObject({ id: busy.id, planName: 'Pro', userCount: 2 });
    const byUser = (await get(`/admin/search?q=${tag}-b`)).json() as AdminSearchResult;
    expect(byUser.users).toEqual([expect.objectContaining({ externalUserId: `${tag}-ben`, accountId: busy.id })]);
  });

  it('validates input and requires the admin token', async () => {
    expect((await get('/admin/search?q=')).statusCode).toBe(400);
    expect((await get('/admin/users?sort=password')).statusCode).toBe(400);
    expect((await get('/admin/accounts?minUsers=5&maxUsers=1')).statusCode).toBe(400);
    expect((await get('/admin/users', keyHeaders(busy.apiKey))).statusCode).toBe(401);
  });
});
