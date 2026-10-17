/**
 * Error codes returned in the `error.code` field of every error response.
 * The HTTP status for each code is fixed and documented in docs/API_CONTRACTS.md.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR', // 400
  API_KEY_MISSING: 'API_KEY_MISSING', // 401
  API_KEY_INVALID: 'API_KEY_INVALID', // 401
  TOKEN_MISSING: 'TOKEN_MISSING', // 401 (no Authorization: Bearer access token)
  TOKEN_INVALID: 'TOKEN_INVALID', // 401 (bad signature, issuer, audience or format)
  TOKEN_EXPIRED: 'TOKEN_EXPIRED', // 401 (refresh it with POST /auth/refresh)
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID', // 401 (missing, expired, revoked or reused)
  CREDENTIAL_INVALID: 'CREDENTIAL_INVALID', // 401 (login: neither the operator token nor a known API key)
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE', // 403 (valid token, wrong interface: operator vs account)
  PLAN_READ_ONLY: 'PLAN_READ_ONLY', // 403
  NOT_FOUND: 'NOT_FOUND', // 404 (unknown route)
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND', // 404
  USER_NOT_FOUND: 'USER_NOT_FOUND', // 404
  PLAN_NOT_FOUND: 'PLAN_NOT_FOUND', // 404
  USAGE_RECORD_NOT_FOUND: 'USAGE_RECORD_NOT_FOUND', // 404
  SIGNUP_REQUEST_NOT_FOUND: 'SIGNUP_REQUEST_NOT_FOUND', // 404 (also a wrong claim code)
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS', // 409
  PLAN_NAME_TAKEN: 'PLAN_NAME_TAKEN', // 409
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED', // 409
  SIGNUP_ALREADY_PENDING: 'SIGNUP_ALREADY_PENDING', // 409 (one open request per email)
  SIGNUP_ALREADY_DECIDED: 'SIGNUP_ALREADY_DECIDED', // 409
  SIGNUP_NOT_APPROVED: 'SIGNUP_NOT_APPROVED', // 409 (claim before approval, or after a denial)
  SIGNUP_ALREADY_CLAIMED: 'SIGNUP_ALREADY_CLAIMED', // 409
  PLAN_SCOPE_MISMATCH: 'PLAN_SCOPE_MISMATCH', // 422
  RATE_LIMITED: 'RATE_LIMITED', // 429
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR', // 502
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE', // 503
  INTERNAL_ERROR: 'INTERNAL_ERROR', // 500
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Shape of every non-2xx JSON response body. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string | null;
    details?: ValidationIssue[] | Record<string, unknown>;
  };
}
