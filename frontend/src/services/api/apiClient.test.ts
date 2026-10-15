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
});

describe('apiRequest', () => {
  it('sends the account API key in X-API-Key and never in the URL', async () => {
    credentials.setAccount({ apiKey: 'umk_test_secret', accountId: 'a1', accountName: 'Test', apiKeyPrefix: 'umk_test' });
    const fetchFn = mockFetch(json(200, { ok: true }));
    await apiRequest('/account', { auth: 'account' });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('umk_test_secret');
    expect(url).not.toContain('umk_test_secret');
  });

  it('fails locally with API_KEY_MISSING when no key is connected', async () => {
    const fetchFn = mockFetch(json(200, {}));
    await expect(apiRequest('/account', { auth: 'account' })).rejects.toMatchObject({ status: 401, code: 'API_KEY_MISSING' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('maps an error envelope to ApiError with code, status and request id', async () => {
    credentials.setAdminToken('token');
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
