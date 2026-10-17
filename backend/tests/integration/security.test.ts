import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, createTestContext, operatorToken, type TestContext } from '../support/testApp';

/** A low failed-credential limit so the throttle is reachable in a test. */
let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext({ env: { AUTH_FAILURE_LIMIT_PER_MINUTE: '3' } });
});
afterAll(async () => ctx.close());

const admin = (token: string | undefined, remoteAddress: string, extra: Record<string, string> = {}) =>
  ctx.app.inject({ method: 'GET', url: '/api/v1/admin/accounts', remoteAddress, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra } });

describe('failed-credential throttle', () => {
  it('blocks a client after repeated wrong tokens, even when it then sends the right one', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) expect((await admin('wrong-token-0123456789', '10.0.0.1')).statusCode).toBe(401);
    const blocked = await admin(operatorToken(), '10.0.0.1');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('RATE_LIMITED');
    // Other clients are not affected.
    expect((await admin(operatorToken(), '10.0.0.2')).statusCode).toBe(200);
  });

  it('counts wrong API keys and login tokens too, but not missing credentials', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await admin(undefined, '10.0.0.3')).statusCode).toBe(401);
    expect((await admin(operatorToken(), '10.0.0.3')).statusCode).toBe(200);

    const wrongKey = () => ctx.app.inject({ method: 'GET', url: '/api/v1/account', remoteAddress: '10.0.0.4', headers: { 'x-api-key': 'umk_live_not_a_real_key_000000000000' } });
    const wrongLogin = () => ctx.app.inject({ method: 'POST', url: '/api/v1/auth/token', remoteAddress: '10.0.0.4', payload: { token: 'guess-guess-guess' } });
    expect((await wrongKey()).statusCode).toBe(401);
    expect((await wrongLogin()).statusCode).toBe(401);
    expect((await wrongKey()).statusCode).toBe(401);
    expect((await wrongLogin()).statusCode).toBe(429);
  });

  it('ignores X-Forwarded-For by default, so a client cannot pick a fresh IP per guess', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await admin('wrong-token-0123456789', '10.0.0.5', { 'x-forwarded-for': `203.0.113.${attempt}` })).statusCode).toBe(401);
    }
    expect((await admin(operatorToken(), '10.0.0.5', { 'x-forwarded-for': '198.51.100.7' })).statusCode).toBe(429);
  });
});

describe('response hardening', () => {
  it('sends security headers and never leaks internals', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/accounts', headers: adminHeaders, remoteAddress: '10.0.0.9' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
    const broken = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/token', remoteAddress: '10.0.0.9', headers: { 'content-type': 'application/json' }, payload: '{not json' });
    expect(broken.statusCode).toBe(400);
    expect(broken.body).not.toMatch(/at .*\.ts|node_modules|stack/i);
  });

  it('rejects oversized bodies and only allows the configured browser origins', async () => {
    const huge = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/token', remoteAddress: '10.0.0.9', payload: { token: 'x'.repeat(70 * 1024) } });
    expect(huge.statusCode).toBe(413);
    const foreign = await ctx.app.inject({ method: 'OPTIONS', url: '/api/v1/account', remoteAddress: '10.0.0.9', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    const allowed = await ctx.app.inject({ method: 'OPTIONS', url: '/api/v1/account', remoteAddress: '10.0.0.9', headers: { origin: 'http://localhost:8080', 'access-control-request-method': 'GET' } });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:8080');
  });
});

describe('trusted proxy (the web container forwarding /api)', () => {
  let proxied: TestContext;
  beforeAll(async () => {
    proxied = await createTestContext({ env: { AUTH_FAILURE_LIMIT_PER_MINUTE: '2', TRUST_PROXY_ADDRESSES: '10.9.9.9' } });
  });
  afterAll(async () => proxied.close());

  const call = (remoteAddress: string, forwardedFor: string, token: string) =>
    proxied.app.inject({ method: 'GET', url: '/api/v1/admin/accounts', remoteAddress, headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': forwardedFor } });

  it('uses X-Forwarded-For from the trusted proxy, so each browser client is limited separately', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) expect((await call('10.9.9.9', '198.51.100.1', 'wrong-token-0123456789')).statusCode).toBe(401);
    expect((await call('10.9.9.9', '198.51.100.1', operatorToken())).statusCode).toBe(429);
    expect((await call('10.9.9.9', '198.51.100.2', operatorToken())).statusCode).toBe(200);
  });

  it('ignores X-Forwarded-For from anyone else', async () => {
    // A direct caller claims to be the blocked client: the header is ignored, its own address counts.
    expect((await call('10.0.0.77', '198.51.100.1', operatorToken())).statusCode).toBe(200);
  });
});
