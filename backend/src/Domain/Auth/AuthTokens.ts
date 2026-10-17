import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '../../contracts';
import { AppError } from '../../Shared/Errors/AppError';

/** Who a verified access token belongs to. */
export type Principal = { role: 'operator' } | { role: 'account'; accountId: string; accountName: string; apiKeyPrefix: string };

/**
 * Refresh tokens: "umr_" + 32 random bytes (base64url). Opaque (not JWTs) so they can be revoked:
 * only the SHA-256 hash is stored, each one is used once (rotation), and presenting a used one
 * again revokes the whole session (reuse detection).
 */
export function generateRefreshToken(random: (size: number) => Buffer = randomBytes): { raw: string; hash: string } {
  const raw = `umr_${random(32).toString('base64url')}`;
  return { raw, hash: hashRefreshToken(raw) };
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** A stored refresh token (one link in a session's rotation chain). */
export interface RefreshTokenRecord {
  id: string;
  /** One login session: every rotated token keeps the family of the first one. */
  familyId: string;
  role: Role;
  accountId: string | null;
  accountName: string | null;
  apiKeyPrefix: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

export const tokenMissing = () => new AppError('TOKEN_MISSING', 'Missing access token. Send Authorization: Bearer <token> (get one from POST /auth/token).');
export const tokenInvalid = () => new AppError('TOKEN_INVALID', 'Invalid access token.');
export const tokenExpired = () => new AppError('TOKEN_EXPIRED', 'The access token has expired. Get a new one with POST /auth/refresh.');
export const refreshTokenInvalid = () => new AppError('REFRESH_TOKEN_INVALID', 'The session has ended. Sign in again.');
export const insufficientRole = (needed: Role) =>
  new AppError('INSUFFICIENT_ROLE', needed === 'operator' ? 'This endpoint is for the operator.' : 'This endpoint is for an account (company) session.');
