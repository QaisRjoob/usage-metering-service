import { ERROR_CODES } from '@/models/api-response';
import { apiConfig } from './apiConfig';
import { CSRF_HEADER, CSRF_HEADER_VALUE, type TokenResponse } from '@/contracts';
import { ApiError, isApiError, isApiErrorBody } from './apiErrors';
import { credentials } from './credentials';

/**
 * Which session a request needs. Both send the JWT access token (Authorization: Bearer); the
 * server checks its role: 'admin' = operator endpoints under /admin, 'account' = account-scoped
 * endpoints. 'none' = public endpoints (sign-in, refresh, sign-up).
 */
export type AuthMode = 'none' | 'admin' | 'account';

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  auth: AuthMode;
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Extra headers (e.g. the CSRF header of the refresh and logout routes). */
  headers?: Record<string, string>;
}

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  // The base may be relative ("/api/v1", same origin as the page) or absolute.
  const url = new URL(`${apiConfig.baseUrl}${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Refresh a little before expiry so a request never leaves with a token about to lapse. */
const REFRESH_MARGIN_MS = 30_000;
let refreshInFlight: Promise<string> | null = null;

/**
 * POST /auth/refresh with the HttpOnly refresh cookie. Concurrent callers share one request. On
 * failure the session ends (the route guard then shows the login page).
 */
export function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= send<TokenResponse>('/auth/refresh', { method: 'POST', auth: 'none', headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE } }, {})
    .then((session) => {
      credentials.setSession(session);
      return session.accessToken;
    })
    .catch((error: unknown) => {
      credentials.clearAll();
      throw error;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function currentAccessToken(): Promise<string> {
  const { accessToken, expiresAt } = credentials.get();
  if (!accessToken) {
    throw new ApiError({ kind: 'http', status: 401, code: ERROR_CODES.TOKEN_MISSING, message: 'Sign in to use this page.' });
  }
  if (expiresAt !== null && expiresAt - REFRESH_MARGIN_MS <= Date.now()) return refreshAccessToken();
  return accessToken;
}

function newCorrelationId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
}

/**
 * Performs a JSON request and maps every failure mode to an ApiError. Signed-in requests carry the
 * access token; one that comes back TOKEN_EXPIRED is refreshed and retried once.
 */
export async function apiRequest<T>(path: string, options: RequestOptions): Promise<T> {
  if (options.auth === 'none') return send<T>(path, options, {});
  const token = await currentAccessToken();
  try {
    return await send<T>(path, options, { Authorization: `Bearer ${token}` });
  } catch (error) {
    if (!isApiError(error) || error.status !== 401 || error.code !== ERROR_CODES.TOKEN_EXPIRED) throw error;
    const fresh = await refreshAccessToken();
    return send<T>(path, options, { Authorization: `Bearer ${fresh}` });
  }
}

async function send<T>(path: string, options: RequestOptions, auth: Record<string, string>): Promise<T> {
  const correlationId = newCorrelationId();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': correlationId,
    ...options.headers,
    ...auth,
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? apiConfig.timeoutMs);
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      // The refresh cookie (HttpOnly, path /api/v1/auth) rides along; it is never readable here.
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (cause) {
    if (timedOut) {
      throw new ApiError({ kind: 'timeout', message: 'The service did not respond in time.', requestId: correlationId });
    }
    if (controller.signal.aborted) {
      throw new ApiError({ kind: 'aborted', message: 'The request was cancelled.', requestId: correlationId });
    }
    throw new ApiError({
      kind: 'network',
      message: cause instanceof Error ? `Network error: ${cause.message}` : 'Network error.',
      requestId: correlationId,
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }

  const requestId = response.headers.get('x-request-id') ?? correlationId;
  const text = await response.text();
  let payload: unknown = undefined;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError({
        kind: 'parse',
        status: response.status,
        message: `The service returned a non-JSON response (HTTP ${response.status}).`,
        requestId,
      });
    }
  }

  if (!response.ok) {
    if (isApiErrorBody(payload)) {
      throw new ApiError({
        kind: 'http',
        status: response.status,
        code: payload.error.code,
        message: payload.error.message,
        requestId: payload.error.requestId ?? requestId,
        details: payload.error.details,
      });
    }
    throw new ApiError({
      kind: 'http',
      status: response.status,
      message: `Request failed with HTTP ${response.status}.`,
      requestId,
    });
  }

  if (payload === undefined && response.status !== 204) {
    throw new ApiError({ kind: 'parse', status: response.status, message: 'The service returned an empty response.', requestId });
  }
  return payload as T;
}
