import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_ADMIN_TOKEN, TEST_DEMO_API_KEY, adminHeaders, createAccount, createTestContext, keyHeaders, type TestContext } from '../support/testApp';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());

describe('API key validation', () => {
  it('rejects a missing key with 401 API_KEY_MISSING', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/account' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'API_KEY_MISSING' } });
    expect(response.json().error.requestId).toBeTruthy();
  });

  it('rejects an unknown or malformed key with 401 API_KEY_INVALID', async () => {
    for (const key of ['umk_live_thisKeyDoesNotExistAnywhere0000000000', 'garbage']) {
      const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/account', headers: keyHeaders(key) });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: 'API_KEY_INVALID' } });
    }
  });

  it('accepts a valid key and identifies the account from it', async () => {
    const created = await createAccount(ctx.app);
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/account', headers: keyHeaders(created.apiKey) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ account: { id: created.account.id }, plan: { name: 'Starter' } });
  });

  it('returns the raw key only once and stores only its hash', async () => {
    const created = await createAccount(ctx.app);
    const { rows } = await ctx.pool.query('SELECT api_key_hash, api_key_prefix FROM accounts WHERE id = $1', [created.account.id]);
    expect(rows[0].api_key_hash).not.toBe(created.apiKey);
    expect(rows[0].api_key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(created.apiKey.startsWith(rows[0].api_key_prefix)).toBe(true);
    const listed = await ctx.app.inject({ method: 'GET', url: `/api/v1/admin/accounts/${created.account.id}`, headers: adminHeaders });
    expect(listed.body).not.toContain(created.apiKey);
  });

  it('accepts the seeded demo key', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/account', headers: keyHeaders(TEST_DEMO_API_KEY) });
    expect(response.json()).toMatchObject({ account: { name: 'شركة الوثائق التجريبية' }, plan: { name: 'الرصيد المشترك التجريبي' } });
  });
});

describe('operator access (JWT)', () => {
  it('protects /admin with 401 for missing or invalid access tokens', async () => {
    const missing = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/accounts' });
    expect(missing.json()).toMatchObject({ error: { code: 'TOKEN_MISSING' } });
    const wrong = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/accounts', headers: { authorization: 'Bearer nope-nope-nope-nope' } });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toMatchObject({ error: { code: 'TOKEN_INVALID' } });
  });

  it('does not accept the operator token itself on /admin (only the JWT it is exchanged for)', async () => {
    const raw = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/accounts', headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` } });
    expect(raw.statusCode).toBe(401);
    expect(raw.json()).toMatchObject({ error: { code: 'TOKEN_INVALID' } });
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/accounts', headers: adminHeaders })).statusCode).toBe(200);
  });

  it('an account API key does not open admin endpoints', async () => {
    const created = await createAccount(ctx.app);
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/accounts', headers: keyHeaders(created.apiKey) });
    expect(response.statusCode).toBe(401);
  });

  it('an operator access token does not open account-scoped endpoints', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/users', headers: adminHeaders });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'INSUFFICIENT_ROLE' } });
  });
});

describe('health', () => {
  it('reports liveness and readiness (database reachable)', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/health' })).json()).toEqual({ status: 'ok' });
    const ready = await ctx.app.inject({ method: 'GET', url: '/api/v1/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ checks: { database: 'ok' } });
  });

  it('serves the OpenAPI document and echoes request ids', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/openapi.json', headers: { 'x-request-id': 'trace-123' } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe('trace-123');
    expect(response.json().paths['/usage/consume'].post.requestBody).toBeDefined();
  });

  it('answers unknown routes with the error envelope', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
