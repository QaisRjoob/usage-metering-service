import { ERROR_CODES } from '@/models/api-response';
import { apiConfig } from './apiConfig';
import { ApiError, isApiErrorBody } from './apiErrors';
import { credentials } from './credentials';

/**
 * Which credential a request carries:
 * - 'admin'   Authorization: Bearer <admin token>   (operator endpoints under /admin)
 * - 'account' X-API-Key: <connected account key>    (account-scoped endpoints)
 * - { apiKey } / { adminToken } an explicit credential, used to verify it before it is stored
 */
export type AuthMode = 'none' | 'admin' | 'account' | { apiKey: string } | { adminToken: string };

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  auth: AuthMode;
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
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

function authHeaders(auth: AuthMode): Record<string, string> {
  if (auth === 'none') return {};
  if (auth === 'admin' || (typeof auth === 'object' && 'adminToken' in auth)) {
    const token = auth === 'admin' ? credentials.get().adminToken : auth.adminToken;
    if (!token) {
      throw new ApiError({
        kind: 'http',
        status: 401,
        code: ERROR_CODES.ADMIN_TOKEN_MISSING,
        message: 'Enter the operator admin token to use this page.',
      });
    }
    return { Authorization: `Bearer ${token}` };
  }
  const apiKey = auth === 'account' ? credentials.get().account?.apiKey : auth.apiKey;
  if (!apiKey) {
    throw new ApiError({
      kind: 'http',
      status: 401,
      code: ERROR_CODES.API_KEY_MISSING,
      message: 'Connect an account API key to use this page.',
    });
  }
  return { [apiConfig.apiKeyHeader]: apiKey };
}

function newCorrelationId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
}

/** Performs a JSON request and maps every failure mode to an ApiError. */
export async function apiRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const correlationId = newCorrelationId();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': correlationId,
    ...authHeaders(options.auth),
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
