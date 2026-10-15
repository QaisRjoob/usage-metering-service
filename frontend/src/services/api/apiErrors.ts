import type { ApiErrorBody, ErrorCode, ValidationIssue } from '@/models/api-response';

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'parse' | 'aborted';

export interface ApiErrorInit {
  kind: ApiErrorKind;
  message: string;
  status?: number;
  code?: ErrorCode | 'UNKNOWN';
  requestId?: string | null;
  details?: ApiErrorBody['error']['details'];
}

/** Single error type thrown by every service, real or mock. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: ErrorCode | 'UNKNOWN';
  readonly requestId: string | null;
  readonly details: ApiErrorBody['error']['details'];

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status ?? null;
    this.code = init.code ?? 'UNKNOWN';
    this.requestId = init.requestId ?? null;
    this.details = init.details;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const inner = (value as { error: unknown }).error;
  return typeof inner === 'object' && inner !== null && 'code' in inner && 'message' in inner;
}

export interface ErrorDescription {
  title: string;
  message: string;
  retryable: boolean;
  requestId: string | null;
}

/** Turns any thrown value into text suitable for an error state. */
export function describeError(error: unknown): ErrorDescription {
  if (!isApiError(error)) {
    return {
      title: 'Something went wrong',
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
      retryable: true,
      requestId: null,
    };
  }
  const base = { requestId: error.requestId };
  switch (error.kind) {
    case 'network':
      return { ...base, title: 'Cannot reach the service', message: error.message, retryable: true };
    case 'timeout':
      return { ...base, title: 'The request timed out', message: error.message, retryable: true };
    case 'parse':
      return { ...base, title: 'Unexpected response', message: error.message, retryable: true };
    case 'aborted':
      return { ...base, title: 'Request cancelled', message: error.message, retryable: true };
    case 'http':
      break;
  }
  switch (error.status) {
    case 401:
      return { ...base, title: 'Authentication required', message: error.message, retryable: false };
    case 403:
      return { ...base, title: 'Not allowed', message: error.message, retryable: false };
    case 404:
      return { ...base, title: 'Not found', message: error.message, retryable: false };
    case 409:
      return { ...base, title: 'Conflict', message: error.message, retryable: false };
    case 400:
    case 422:
      return { ...base, title: 'Invalid request', message: error.message, retryable: false };
    case 429:
      return { ...base, title: 'Too many requests', message: error.message, retryable: true };
    default:
      return { ...base, title: 'Service error', message: error.message, retryable: true };
  }
}

/** Maps server validation issues to form field errors, keyed by the field path. */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!isApiError(error) || !Array.isArray(error.details)) return {};
  const result: Record<string, string> = {};
  for (const issue of error.details as ValidationIssue[]) {
    result[issue.path || '_form'] ??= issue.message;
  }
  return result;
}
