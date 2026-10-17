import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, buildUrl } from './apiClient';
import { ApiError } from './apiErrors';
import { credentials } from './credentials';

function mockFetch(response: Response | Error) {
  const fn = vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildUrl', () => {
  it('skips empty query values', () => {
    const url = new URL(buildUrl('/usage', { page: 2, outcome: undefined, userId: '', month: '2026-10' }));
    expect(url.pathname.endsWith('/usage')).toBe(true);
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.has('outcome')).toBe(false);
    expect(url.searchParams.has('userId')).toBe(false);
  });

  it('calls the API on the same origin as the page by default (no cross-origin request)', () => {
    const url = new URL(buildUrl('/auth/token'));
    expect(url.origin).toBe(window.location.origin);
    expect(url.pathname).toBe('/api/v1/auth/token');
  });
});

describe('apiRequest', () => {
  const session = (accessToken: string, expiresIn = 900) => credentials.setSession({ accessToken, expiresIn, role: 'account', account: { id: 'a1', name: 'Test', apiKeyPrefix: 'umk_test' } });
  const authHeader = (call: unknown) => ((call as [string, RequestInit])[1].headers as Record<string, string>).Authorization;

  it('sends the access token as Authorization: Bearer and never in the URL', async () => {
    session('jwt-access-1');
    const fetchFn = mockFetch(json(200, { ok: true }));
    await apiRequest('/account', { auth: 'account' });
    const [url] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(authHeader(fetchFn.mock.calls[0])).toBe('Bearer jwt-access-1');
    expect(url).not.toContain('jwt-access-1');
  });

  it('fails locally with TOKEN_MISSING when nobody is signed in', async () => {
    const fetchFn = mockFetch(json(200, {}));
    await expect(apiRequest('/account', { auth: 'account' })).rejects.toMatchObject({ status: 401, code: 'TOKEN_MISSING' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refreshes an expired access token once and retries the request', async () => {
    session('jwt-old');
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired', requestId: 'r1' } }))
      .mockResolvedValueOnce(json(200, { accessToken: 'jwt-new', tokenType: 'Bearer', expiresIn: 900, role: 'account', account: { id: 'a1', name: 'Test', apiKeyPrefix: 'umk_test' } }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    vi.stubGlobal('fetch', fetchFn);
    await expect(apiRequest('/account', { auth: 'account' })).resolves.toEqual({ ok: true });
    const [refreshUrl, refreshInit] = fetchFn.mock.calls[1] as [string, RequestInit];
    expect(refreshUrl).toContain('/auth/refresh');
    expect(refreshInit).toMatchObject({ method: 'POST', credentials: 'include' });
    expect((refreshInit.headers as Record<string, string>)['x-requested-with']).toBe('umk-web');
    expect(authHeader(fetchFn.mock.calls[2])).toBe('Bearer jwt-new');
    expect(credentials.get().accessToken).toBe('jwt-new');
  });

  it('refreshes ahead of expiry, and ends the session when the refresh fails', async () => {
    session('jwt-about-to-expire', 10);
    const fetchFn = mockFetch(json(401, { error: { code: 'REFRESH_TOKEN_INVALID', message: 'ended', requestId: 'r2' } }));
    await expect(apiRequest('/account', { auth: 'account' })).rejects.toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toContain('/auth/refresh');
    expect(credentials.get().accessToken).toBeNull();
  });

  it('maps an error envelope to ApiError with code, status and request id', async () => {
    credentials.setSession({ accessToken: 'token', expiresIn: 900, role: 'operator' });
    mockFetch(json(409, { error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'reused', requestId: 'req-1' } }));
    const error = await apiRequest('/admin/accounts', { auth: 'admin' }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 409, code: 'IDEMPOTENCY_KEY_REUSED', requestId: 'req-1' });
  });

  it('reports network failures and non-JSON responses distinctly', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    await expect(apiRequest('/health', { auth: 'none' })).rejects.toMatchObject({ kind: 'network' });
    mockFetch(new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(apiRequest('/health', { auth: 'none' })).rejects.toMatchObject({ kind: 'parse', status: 502 });
  });

  it('treats an empty 200 body as an unexpected response', async () => {
    mockFetch(new Response('', { status: 200 }));
    await expect(apiRequest('/health', { auth: 'none' })).rejects.toMatchObject({ kind: 'parse' });
  });

  it('times out slow requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))),
    );
    await expect(apiRequest('/health', { auth: 'none', timeoutMs: 10 })).rejects.toMatchObject({ kind: 'timeout' });
  });
});
