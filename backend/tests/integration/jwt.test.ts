import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, decodeJwt, decodeProtectedHeader } from 'jose';
import type { TokenResponse } from '../../src/contracts';
import { JoseAccessTokenService } from '../../src/Infrastructure/Auth/JoseAccessTokenService';
import { TEST_ADMIN_TOKEN, TEST_DEMO_API_KEY, TEST_JWT_SECRET, createAccount, createTestContext, type TestContext } from '../support/testApp';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());

const CSRF = { 'x-requested-with': 'umk-web' };
const login = (token: unknown) => ctx.app.inject({ method: 'POST', url: '/api/v1/auth/token', payload: { token } });
const refresh = (cookie?: string, headers: Record<string, string> = CSRF) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { ...headers, ...(cookie ? { cookie: `umk_refresh=${cookie}` } : {}) } });
const refreshCookieOf = (response: { cookies: { name: string; value: string }[] }) => response.cookies.find((cookie) => cookie.name === 'umk_refresh');
const get = (url: string, accessToken: string) => ctx.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { authorization: `Bearer ${accessToken}` } });

describe('POST /auth/token (sign in)', () => {
  it('exchanges the operator token for an operator JWT and sets an HttpOnly refresh cookie', async () => {
    const response = await login(TEST_ADMIN_TOKEN);
    expect(response.statusCode).toBe(200);
    const body = response.json() as TokenResponse;
    expect(body).toMatchObject({ tokenType: 'Bearer', role: 'operator', expiresIn: 900 });
    expect(decodeProtectedHeader(body.accessToken)).toMatchObject({ alg: 'HS256', typ: 'JWT' });
    expect(decodeJwt(body.accessToken)).toMatchObject({ iss: 'usage-metering', aud: 'usage-metering-api', sub: 'operator', role: 'operator' });
    const cookie = refreshCookieOf(response)!;
    expect(cookie.value).toMatch(/^umr_/);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/v1/auth' });
    expect((await get('/admin/accounts', body.accessToken)).statusCode).toBe(200);
  });

  it('exchanges an API key for an account JWT scoped to that account', async () => {
    const created = await createAccount(ctx.app);
    const body = (await login(created.apiKey)).json() as TokenResponse;
    expect(body).toMatchObject({ role: 'account', account: { id: created.account.id, name: created.account.name, apiKeyPrefix: created.account.apiKeyPrefix } });
    expect(decodeJwt(body.accessToken)).toMatchObject({ sub: created.account.id, role: 'account' });
    const current = await get('/account', body.accessToken);
    expect(current.json()).toMatchObject({ account: { id: created.account.id } });
    // The token never carries the API key itself.
    expect(body.accessToken).not.toContain(created.apiKey);
    expect(JSON.stringify(decodeJwt(body.accessToken))).not.toContain(created.apiKey);
  });

  it('answers one generic 401 for anything else and validates the body', async () => {
    for (const token of ['umk_live_doesNotExistAnywhere00000000000000', 'random-text', `${TEST_ADMIN_TOKEN}x`]) {
      const response = await login(token);
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('CREDENTIAL_INVALID');
      expect(refreshCookieOf(response)).toBeUndefined();
    }
    expect((await login('')).statusCode).toBe(400);
    expect((await login(`  ${TEST_DEMO_API_KEY}\n`)).json()).toMatchObject({ role: 'account' });
  });
});

describe('access token verification', () => {
  it('rejects tampered, foreign, unsigned and expired tokens', async () => {
    const operator = ((await login(TEST_ADMIN_TOKEN)).json() as TokenResponse).accessToken;
    const [header, payload, signature] = operator.split('.');
    const escalated = Buffer.from(JSON.stringify({ ...decodeJwt(operator), sub: 'someone' })).toString('base64url');
    const cases: Record<string, string> = {
      tampered: `${header}.${escalated}.${signature}`,
      unsigned: `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${payload}.`,
      otherSecret: await new SignJWT({ role: 'operator' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('usage-metering')
        .setAudience('usage-metering-api')
        .setSubject('operator')
        .setIssuedAt()
        .setExpirationTime('5m')
        .setJti('x')
        .sign(new TextEncoder().encode('another-secret-another-secret-another-secret')),
      wrongAudience: await new SignJWT({ role: 'operator' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('usage-metering')
        .setAudience('someone-else')
        .setSubject('operator')
        .setIssuedAt()
        .setExpirationTime('5m')
        .setJti('x')
        .sign(new TextEncoder().encode(TEST_JWT_SECRET)),
    };
    for (const [name, token] of Object.entries(cases)) {
      const response = await get('/admin/accounts', token);
      expect({ name, status: response.statusCode, code: response.json().error.code }).toEqual({ name, status: 401, code: 'TOKEN_INVALID' });
    }

    let now = new Date('2026-10-01T00:00:00Z');
    const service = new JoseAccessTokenService(TEST_JWT_SECRET, 60, { now: () => now });
    const short = (await service.issue({ role: 'operator' })).token;
    now = new Date('2026-10-01T00:02:00Z');
    await expect(service.verify(short)).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    const expired = await get('/admin/accounts', short);
    expect(expired.statusCode).toBe(401);
    expect(expired.json().error.code).toBe('TOKEN_EXPIRED');
  });

  it('keeps the two interfaces apart: role decides, 403 for the wrong one', async () => {
    const created = await createAccount(ctx.app);
    const account = ((await login(created.apiKey)).json() as TokenResponse).accessToken;
    const operator = ((await login(TEST_ADMIN_TOKEN)).json() as TokenResponse).accessToken;
    expect((await get('/admin/accounts', account)).statusCode).toBe(403);
    expect((await get('/admin/accounts', account)).json().error.code).toBe('INSUFFICIENT_ROLE');
    expect((await get('/users', operator)).statusCode).toBe(403);
    // Server-to-server clients still use the API key directly (the brief requires it).
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/users', headers: { 'x-api-key': created.apiKey } })).statusCode).toBe(200);
  });
});

describe('refresh tokens', () => {
  it('rotates: each refresh returns a new access token and a new refresh cookie', async () => {
    const first = await login(TEST_ADMIN_TOKEN);
    const cookie1 = refreshCookieOf(first)!.value;
    const second = await refresh(cookie1);
    expect(second.statusCode).toBe(200);
    const cookie2 = refreshCookieOf(second)!.value;
    expect(cookie2).not.toBe(cookie1);
    expect((second.json() as TokenResponse).role).toBe('operator');
    expect((await refresh(cookie2)).statusCode).toBe(200);
  });

  it('detects reuse of a used refresh token and revokes the whole session', async () => {
    const start = await login(TEST_DEMO_API_KEY);
    const stolen = refreshCookieOf(start)!.value;
    const legit = refreshCookieOf(await refresh(stolen))!.value; // the real user refreshes first
    const replay = await refresh(stolen); // the attacker replays the copied (now used) token
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('REFRESH_TOKEN_INVALID');
    // The legitimate holder is logged out too: the session family was revoked.
    expect((await refresh(legit)).statusCode).toBe(401);
  });

  it('requires the CSRF header and a cookie', async () => {
    const cookie = refreshCookieOf(await login(TEST_ADMIN_TOKEN))!.value;
    expect((await refresh(cookie, {})).statusCode).toBe(400);
    expect((await refresh(undefined)).json().error.code).toBe('REFRESH_TOKEN_INVALID');
    expect((await refresh('umr_made-up-value')).statusCode).toBe(401);
  });

  it('logout revokes the session and clears the cookie', async () => {
    const cookie = refreshCookieOf(await login(TEST_ADMIN_TOKEN))!.value;
    const out = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { ...CSRF, cookie: `umk_refresh=${cookie}` } });
    expect(out.statusCode).toBe(204);
    expect(refreshCookieOf(out)?.value).toBe('');
    expect((await refresh(cookie)).statusCode).toBe(401);
  });

  it('stores only hashes of refresh tokens', async () => {
    const cookie = refreshCookieOf(await login(TEST_ADMIN_TOKEN))!.value;
    const { rows } = await ctx.pool.query('SELECT count(*) AS n FROM refresh_tokens WHERE token_hash = $1', [cookie]);
    expect(rows[0].n).toBe(0);
  });
});
