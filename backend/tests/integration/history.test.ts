import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, consumeOk, createTestContext, keyHeaders, setupWorkedExampleAccount, type TestContext } from '../support/testApp';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  ctx.clock.reset();
  await ctx.close();
});

describe('usage history and months', () => {
  it('starts each UTC month at zero and keeps previous months queryable', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    ctx.clock.set('2026-09-30T23:59:58Z');
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 20 });
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 25 }); // rejected in September
    ctx.clock.set('2026-10-01T00:00:01Z');
    const october = await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 5 });
    expect(october).toMatchObject({ period: '2026-10', user: { consumed: 5 }, account: { consumed: 5 } });

    const september = await ctx.app.inject({ method: 'GET', url: '/api/v1/account/usage-summary?month=2026-09', headers: keyHeaders(apiKey) });
    expect(september.json()).toMatchObject({
      period: '2026-09',
      account: { consumed: 20 },
      requests: { accepted: 1, rejected: 1, unitsRejected: 25 },
      rejectionsByRule: [{ rule: 'MAX_UNITS_PER_REQUEST', level: 'user', count: 1 }],
    });
    expect(september.json().daily).toHaveLength(30);

    const user = await ctx.app.inject({ method: 'GET', url: '/api/v1/users/alice/usage-summary?month=2026-09', headers: keyHeaders(apiKey) });
    expect(user.json()).toMatchObject({ quota: { consumed: 20 }, requests: { accepted: 1, rejected: 1 } });

    const history = await ctx.app.inject({ method: 'GET', url: '/api/v1/usage?month=2026-09', headers: keyHeaders(apiKey) });
    expect(history.json().totalItems).toBe(2);
    ctx.clock.reset();
  });

  it('paginates newest first with stable ordering and filters', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    for (let index = 0; index < 7; index += 1) await consumeOk(ctx.app, apiKey, { userId: index % 2 ? 'alice' : 'bob', units: index + 1, requestId: `h-${index}` });
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 99, requestId: 'h-rejected' });

    const first = (await ctx.app.inject({ method: 'GET', url: '/api/v1/usage?page=1&pageSize=3', headers: keyHeaders(apiKey) })).json();
    expect(first).toMatchObject({ page: 1, pageSize: 3, totalItems: 8, totalPages: 3, hasNextPage: true, hasPreviousPage: false });
    expect(first.items[0].requestId).toBe('h-rejected');
    const last = (await ctx.app.inject({ method: 'GET', url: '/api/v1/usage?page=3&pageSize=3', headers: keyHeaders(apiKey) })).json();
    expect(last).toMatchObject({ hasNextPage: false, hasPreviousPage: true });
    expect(last.items).toHaveLength(2);
    const ids = new Set([...first.items, ...last.items].map((item: { id: string }) => item.id));
    expect(ids.size).toBe(5);

    const rejected = (await ctx.app.inject({ method: 'GET', url: '/api/v1/usage?outcome=rejected', headers: keyHeaders(apiKey) })).json();
    expect(rejected.items).toEqual([expect.objectContaining({ requestId: 'h-rejected', rejectionRule: 'MAX_UNITS_PER_REQUEST', rejectionLevel: 'user', unitsConsumed: 0 })]);
    const bob = (await ctx.app.inject({ method: 'GET', url: '/api/v1/usage?userId=bob', headers: keyHeaders(apiKey) })).json();
    expect(bob.totalItems).toBe(4);
    const today = new Date().toISOString().slice(0, 10);
    const range = (await ctx.app.inject({ method: 'GET', url: `/api/v1/usage?from=${today}&to=${today}`, headers: keyHeaders(apiKey) })).json();
    expect(range.totalItems).toBe(8);
    const empty = (await ctx.app.inject({ method: 'GET', url: '/api/v1/usage?page=50', headers: keyHeaders(apiKey) })).json();
    expect(empty).toMatchObject({ items: [], totalItems: 8 });
  });

  it('validates pagination and filters', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    for (const query of ['pageSize=500', 'page=0', 'month=2026-13', 'outcome=maybe', 'from=yesterday']) {
      const response = await ctx.app.inject({ method: 'GET', url: `/api/v1/usage?${query}`, headers: keyHeaders(apiKey) });
      expect(response.statusCode, query).toBe(400);
    }
  });

  it('quota overview shows both levels and pages users', async () => {
    const { apiKey } = await setupWorkedExampleAccount(ctx.app);
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 20 });
    const overview = (await ctx.app.inject({ method: 'GET', url: '/api/v1/quotas?pageSize=1', headers: keyHeaders(apiKey) })).json();
    expect(overview.account).toMatchObject({ level: 'account', consumed: 20 });
    expect(overview.users).toMatchObject({ totalItems: 2, totalPages: 2, items: [{ externalUserId: 'alice', quota: { level: 'user', consumed: 20 } }] });
  });
});

describe('operator views', () => {
  it('lists accounts with search, status filter and utilization sort', async () => {
    const { apiKey, accountId } = await setupWorkedExampleAccount(ctx.app, { accountMonthly: 10, accountPerRequest: 100, userMonthly: 1_000, userPerRequest: 20 });
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 10 });
    const exhausted = (await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/accounts?status=exhausted&pageSize=100', headers: adminHeaders })).json();
    expect(exhausted.items.map((item: { id: string }) => item.id)).toContain(accountId);
    const sorted = (await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/accounts?sort=utilization&order=desc&pageSize=1', headers: adminHeaders })).json();
    expect(sorted.items[0].quota.utilizationPercent).toBeGreaterThanOrEqual(100);
    const search = (await ctx.app.inject({ method: 'GET', url: `/api/v1/admin/accounts?search=${accountId}`, headers: adminHeaders })).json();
    expect(search.totalItems).toBe(1);
  });

  it('shows account details, users and cross-account history', async () => {
    const { apiKey, accountId } = await setupWorkedExampleAccount(ctx.app);
    await consumeOk(ctx.app, apiKey, { userId: 'alice', units: 10 });
    const details = (await ctx.app.inject({ method: 'GET', url: `/api/v1/admin/accounts/${accountId}`, headers: adminHeaders })).json();
    expect(details).toMatchObject({ id: accountId, userCount: 2, quota: { consumed: 10 }, requests: { accepted: 1 } });
    const users = (await ctx.app.inject({ method: 'GET', url: `/api/v1/admin/accounts/${accountId}/users`, headers: adminHeaders })).json();
    expect(users.totalItems).toBe(2);
    const usage = (await ctx.app.inject({ method: 'GET', url: `/api/v1/admin/usage?accountId=${accountId}`, headers: adminHeaders })).json();
    expect(usage.totalItems).toBe(1);
    const missing = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/accounts/00000000-0000-4000-8000-00000000ffff', headers: adminHeaders });
    expect(missing.statusCode).toBe(404);
  });

  it('summarizes the dashboard from aggregates', async () => {
    const summary = (await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/analytics/summary', headers: adminHeaders })).json();
    expect(summary.totals.accounts).toBeGreaterThan(0);
    expect(summary.totals.unitsConsumed).toBeGreaterThan(0);
    expect(summary.monthly).toHaveLength(6);
    expect(summary.recentActivity.length).toBeGreaterThan(0);
    const { rows } = await ctx.pool.query("SELECT COALESCE(sum(consumed), 0) AS total FROM account_usage_counters WHERE period = date_trunc('month', now() AT TIME ZONE 'UTC')::date");
    expect(summary.totals.unitsConsumed).toBe(rows[0].total);
  });
});
