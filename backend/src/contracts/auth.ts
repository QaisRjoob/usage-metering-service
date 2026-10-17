import { z } from 'zod';

/**
 * Authentication with JWT.
 *
 * - POST /auth/token: exchange a credential (an account API key or the operator token) for a
 *   short-lived JWT access token. A refresh token is set as an HttpOnly cookie.
 * - Every other request sends `Authorization: Bearer <access token>`. Account routes also accept
 *   `X-API-Key` directly, for server-to-server client applications (the brief requires it).
 * - POST /auth/refresh: a new access token (and a new refresh token) from the cookie.
 * - POST /auth/logout: revokes the refresh token and clears the cookie.
 */
export const ROLES = ['operator', 'account'] as const;
export type Role = (typeof ROLES)[number];

/** POST /auth/token - the credential travels in the body (never in the URL) and is not logged. */
export const tokenRequestSchema = z.object({
  token: z.string().trim().min(1, 'Enter a token or API key').max(512),
});
export type TokenRequest = z.infer<typeof tokenRequestSchema>;

/** The account a session belongs to (non-secret; the API key itself is never returned). */
export interface SessionAccount {
  id: string;
  name: string;
  apiKeyPrefix: string;
}

/** POST /auth/token and POST /auth/refresh. */
export interface TokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  /** Seconds until the access token expires. */
  expiresIn: number;
  role: Role;
  /** Present for role "account". */
  account?: SessionAccount;
}

/** Claims of an access token (HS256). */
export interface AccessTokenClaims {
  iss: string;
  aud: string;
  /** "operator" or the account id. */
  sub: string;
  role: Role;
  /** Account name, for display and logs (role "account"). */
  name?: string;
  /** Display prefix of the API key the session started from (role "account"). */
  kp?: string;
  iat: number;
  exp: number;
  jti: string;
}

/** Name of the HttpOnly refresh cookie and the header that the cookie routes require (CSRF guard). */
export const REFRESH_COOKIE = 'umk_refresh';
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'umk-web';
