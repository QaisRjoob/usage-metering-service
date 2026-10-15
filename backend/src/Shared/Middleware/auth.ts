import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticatedAccount } from '../../Domain/Accounts/Account';
import { adminTokenInvalid, adminTokenMissing } from '../../Domain/Accounts/AccountErrors';

export const API_KEY_HEADER = 'x-api-key';

type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function bearerToken(request: FastifyRequest): string | undefined {
  const header = headerValue(request, 'authorization');
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

/** Constant-time comparison (both sides hashed first so lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/** Account scope: resolves X-API-Key to request.account, or answers 401. */
export function requireApiKey(authenticate: (rawKey: string | undefined) => Promise<AuthenticatedAccount>): PreHandler {
  return async (request) => {
    request.account = await authenticate(headerValue(request, API_KEY_HEADER));
  };
}

/** Operator scope: Authorization: Bearer <ADMIN_API_TOKEN>, or 401. */
export function requireAdmin(adminToken: string): PreHandler {
  return async (request) => {
    const token = bearerToken(request);
    if (!token) throw adminTokenMissing();
    if (!safeEqual(token, adminToken)) throw adminTokenInvalid();
    request.isAdmin = true;
  };
}

/**
 * Either credential (used by the AI advisor). An API key wins and limits the answer to that
 * account; the admin token allows cross-account answers.
 */
export function requireApiKeyOrAdmin(authenticate: (rawKey: string | undefined) => Promise<AuthenticatedAccount>, adminToken: string): PreHandler {
  const viaKey = requireApiKey(authenticate);
  const viaAdmin = requireAdmin(adminToken);
  return async (request, reply) => {
    if (headerValue(request, API_KEY_HEADER) !== undefined || bearerToken(request) === undefined) return viaKey(request, reply);
    return viaAdmin(request, reply);
  };
}
