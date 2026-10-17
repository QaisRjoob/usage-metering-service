import type { Role } from '../../contracts';
import type { RefreshTokenRepository } from '../../Application/Modules/Auth/Interfaces/AuthPorts';
import type { RefreshTokenRecord } from '../../Domain/Auth/AuthTokens';
import type { Queryable } from '../Database/postgres';

interface RefreshTokenColumns {
  id: string;
  family_id: string;
  role: Role;
  account_id: string | null;
  account_name: string | null;
  api_key_prefix: string | null;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
}

export class PostgresRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: { familyId: string | null; tokenHash: string; role: Role; accountId: string | null; createdAt: Date; expiresAt: Date }): Promise<{ id: string; familyId: string }> {
    const { rows } = await this.db.query<{ id: string; family_id: string }>(
      `INSERT INTO refresh_tokens (family_id, token_hash, role, account_id, created_at, expires_at)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6)
       RETURNING id, family_id`,
      [input.familyId, input.tokenHash, input.role, input.accountId, input.createdAt, input.expiresAt],
    );
    return { id: rows[0]!.id, familyId: rows[0]!.family_id };
  }

  async findByHashForUpdate(tokenHash: string): Promise<RefreshTokenRecord | null> {
    // Account name and key prefix are read from the account (not copied into the token row).
    const { rows } = await this.db.query<RefreshTokenColumns>(
      `SELECT t.id, t.family_id, t.role, t.account_id, a.name AS account_name, a.api_key_prefix,
              t.expires_at, t.used_at, t.revoked_at
       FROM refresh_tokens t LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.token_hash = $1
       FOR UPDATE OF t`,
      [tokenHash],
    );
    const row = rows[0];
    return row
      ? {
          id: row.id,
          familyId: row.family_id,
          role: row.role,
          accountId: row.account_id,
          accountName: row.account_name,
          apiKeyPrefix: row.api_key_prefix,
          expiresAt: row.expires_at,
          usedAt: row.used_at,
          revokedAt: row.revoked_at,
        }
      : null;
  }

  async markUsed(id: string, at: Date): Promise<void> {
    await this.db.query('UPDATE refresh_tokens SET used_at = $2 WHERE id = $1', [id, at]);
  }

  async revokeFamily(familyId: string, at: Date): Promise<number> {
    const result = await this.db.query('UPDATE refresh_tokens SET revoked_at = $2 WHERE family_id = $1 AND revoked_at IS NULL', [familyId, at]);
    return result.rowCount ?? 0;
  }

  async deleteExpired(before: Date): Promise<number> {
    const result = await this.db.query('DELETE FROM refresh_tokens WHERE expires_at < $1', [before]);
    return result.rowCount ?? 0;
  }
}
