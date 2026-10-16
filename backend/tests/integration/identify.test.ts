import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_ADMIN_TOKEN, TEST_DEMO_API_KEY, createAccount, createTestContext, type TestContext } from '../support/testApp';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());

const identify = (token: unknown) => ctx.app.inject({ method: 'POST', url: '/api/v1/auth/identify', payload: { token } });

describe('POST /auth/identify (single-field login)', () => {
  it('recognises the admin token as the operator', async () => {
    const response = await identify(TEST_ADMIN_TOKEN);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ role: 'operator' });
  });

  it('recognises an account API key and says which account it belongs to', async () => {
    const created = await createAccount(ctx.app);
    const response = await identify(created.apiKey);
    expect(response.json()).toEqual({
      role: 'account',
      account: { id: created.account.id, name: created.account.name, apiKeyPrefix: created.account.apiKeyPrefix },
    });
    expect((await identify(TEST_DEMO_API_KEY)).json()).toMatchObject({ role: 'account', account: { name: 'Demo Docs Inc' } });
  });

  it('trims surrounding whitespace from pasted tokens', async () => {
    expect((await identify(`  ${TEST_ADMIN_TOKEN}\n`)).json()).toEqual({ role: 'operator' });
  });

  it.each([['umk_live_doesNotExistAnywhere00000000000000'], ['some-random-text'], [`${TEST_ADMIN_TOKEN}x`]])(
    'answers one generic 401 for %s',
    async (token) => {
      const response = await identify(token);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: 'CREDENTIAL_INVALID' } });
    },
  );

  it('validates the body', async () => {
    expect((await identify('')).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/identify', payload: {} })).statusCode).toBe(400);
    expect((await identify('x'.repeat(600))).statusCode).toBe(400);
  });

  it('needs no credential header and does not open anything by itself', async () => {
    const response = await identify(TEST_ADMIN_TOKEN);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/accounts' })).statusCode).toBe(401);
  });
});
