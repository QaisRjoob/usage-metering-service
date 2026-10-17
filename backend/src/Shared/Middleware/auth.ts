import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticatedAccount } from '../../Domain/Accounts/Account';
import { apiKeyMissing } from '../../Domain/Accounts/AccountErrors';
import { insufficientRole, tokenMissing, type Principal } from '../../Domain/Auth/AuthTokens';

export const API_KEY_HEADER = 'x-api-key';

type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
type AuthenticateKey = (rawKey: string | undefined) => Promise<AuthenticatedAccount>;
type VerifyToken = (token: string) => Promise<Principal>;

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function bearerToken(request: FastifyRequest): string | undefined {
  const header = headerValue(request, 'authorization');
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

/** Constant-time comparison (both sides hashed first so lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function setAccount(request: FastifyRequest, principal: Extract<Principal, { role: 'account' }>): void {
  request.account = { id: principal.accountId, name: principal.accountName };
  request.role = 'account';
}

/**
 * Operator routes: a JWT access token with role "operator" (from POST /auth/token with the operator
 * token). The operator token itself is not accepted here.
 */
export function requireOperator(verify: VerifyToken): PreHandler {
  return async (request) => {
    const token = bearerToken(request);
    if (!token) throw tokenMissing();
    const principal = await verify(token);
    if (principal.role !== 'operator') throw insufficientRole('operator');
    request.role = 'operator';
  };
}

/**
 * Account routes: an account JWT access token, or the account API key in X-API-Key (for
 * server-to-server client applications, as the brief requires). Either way the account comes
 * from the credential, never from the request body or URL.
 */
export function requireAccount(authenticateKey: AuthenticateKey, verify: VerifyToken): PreHandler {
  return async (request) => {
    const apiKey = headerValue(request, API_KEY_HEADER);
    if (apiKey !== undefined) {
      request.account = await authenticateKey(apiKey);
      request.role = 'account';
      return;
    }
    const token = bearerToken(request);
    if (!token) throw apiKeyMissing();
    const principal = await verify(token);
    if (principal.role !== 'account') throw insufficientRole('account');
    setAccount(request, principal);
  };
}

/**
 * Either role (AI advisor): an API key or account token limits the answer to that account; an
 * operator token allows cross-account answers.
 */
export function requireAnyRole(authenticateKey: AuthenticateKey, verify: VerifyToken): PreHandler {
  return async (request) => {
    const apiKey = headerValue(request, API_KEY_HEADER);
    if (apiKey !== undefined) {
      request.account = await authenticateKey(apiKey);
      request.role = 'account';
      return;
    }
    const token = bearerToken(request);
    if (!token) throw apiKeyMissing();
    const principal = await verify(token);
    if (principal.role === 'account') setAccount(request, principal);
    else request.role = 'operator';
  };
}
