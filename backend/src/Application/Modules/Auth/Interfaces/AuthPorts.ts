import type { Role } from '../../../../contracts';
import type { Principal, RefreshTokenRecord } from '../../../../Domain/Auth/AuthTokens';

/** Signs and verifies JWT access tokens. Verification throws TOKEN_INVALID or TOKEN_EXPIRED. */
export interface AccessTokenService {
  issue(principal: Principal): Promise<{ token: string; expiresIn: number }>;
  verify(token: string): Promise<Principal>;
}

export interface RefreshTokenRepository {
  create(input: { familyId: string | null; tokenHash: string; role: Role; accountId: string | null; createdAt: Date; expiresAt: Date }): Promise<{ id: string; familyId: string }>;
  /** Row-locks the token for the rest of the transaction (rotation). */
  findByHashForUpdate(tokenHash: string): Promise<RefreshTokenRecord | null>;
  markUsed(id: string, at: Date): Promise<void>;
  /** Revokes every token of a session; returns how many were still active. */
  revokeFamily(familyId: string, at: Date): Promise<number>;
  /** Housekeeping: deletes tokens that expired before `before`. */
  deleteExpired(before: Date): Promise<number>;
}
