import type { TokenResponse } from '../../../contracts';
import { generateRefreshToken, hashRefreshToken, refreshTokenInvalid, type Principal } from '../../../Domain/Auth/AuthTokens';
import type { Clock } from '../../Common/Clock';
import type { TransactionManager } from '../../Common/TransactionManager';
import type { IdentifyCredentialQuery } from '../Accounts/Queries/IdentifyCredentialQuery';
import type { AccessTokenService, RefreshTokenRepository } from './Interfaces/AuthPorts';

/** What the HTTP layer needs: the JSON body and the refresh token to put in the HttpOnly cookie. */
export interface IssuedSession {
  response: TokenResponse;
  refreshToken: { raw: string; expiresAt: Date };
}

async function buildResponse(accessTokens: AccessTokenService, principal: Principal): Promise<TokenResponse> {
  const access = await accessTokens.issue(principal);
  return {
    accessToken: access.token,
    tokenType: 'Bearer',
    expiresIn: access.expiresIn,
    role: principal.role,
    ...(principal.role === 'account' ? { account: { id: principal.accountId, name: principal.accountName, apiKeyPrefix: principal.apiKeyPrefix } } : {}),
  };
}

/**
 * POST /auth/token - exchanges a credential (an account API key or the operator token) for a JWT
 * access token and starts a refresh-token family (one login session).
 */
export class IssueTokenCommand {
  constructor(
    private readonly identify: IdentifyCredentialQuery,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly clock: Clock,
    private readonly refreshTtlMs: number,
  ) {}

  async execute(credential: string): Promise<IssuedSession> {
    const principal = await this.identify.execute(credential);
    const now = this.clock.now();
    const refresh = generateRefreshToken();
    const expiresAt = new Date(now.getTime() + this.refreshTtlMs);
    await this.refreshTokens.create({
      familyId: null,
      tokenHash: refresh.hash,
      role: principal.role,
      accountId: principal.role === 'account' ? principal.accountId : null,
      createdAt: now,
      expiresAt,
    });
    return { response: await buildResponse(this.accessTokens, principal), refreshToken: { raw: refresh.raw, expiresAt } };
  }
}

type RotationOutcome = { kind: 'ok'; principal: Principal; refresh: { raw: string; expiresAt: Date } } | { kind: 'invalid' } | { kind: 'reused' };

/**
 * POST /auth/refresh - rotation: the presented refresh token is used up and the next one of the same
 * family is issued with a new access token. Presenting an already-used token means it was copied
 * (stolen or replayed): the whole family is revoked, so neither copy works any more.
 */
export class RefreshTokenCommand {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly accessTokens: AccessTokenService,
    private readonly clock: Clock,
    private readonly refreshTtlMs: number,
    private readonly onReuse: (familyId: string) => void = () => {},
  ) {}

  async execute(rawRefreshToken: string | undefined): Promise<IssuedSession> {
    if (!rawRefreshToken) throw refreshTokenInvalid();
    const now = this.clock.now();
    let reusedFamily: string | null = null;
    // The revocation of a reused family must be committed, so the outcome is returned and the
    // error thrown only after the transaction.
    const outcome = await this.transactions.run<RotationOutcome>(async (repos) => {
      const record = await repos.refreshTokens.findByHashForUpdate(hashRefreshToken(rawRefreshToken));
      if (!record || record.revokedAt) return { kind: 'invalid' };
      if (record.usedAt) {
        await repos.refreshTokens.revokeFamily(record.familyId, now);
        reusedFamily = record.familyId;
        return { kind: 'reused' };
      }
      if (record.expiresAt <= now) return { kind: 'invalid' };
      let principal: Principal;
      if (record.role === 'operator') principal = { role: 'operator' };
      else if (record.accountId && record.accountName && record.apiKeyPrefix) {
        principal = { role: 'account', accountId: record.accountId, accountName: record.accountName, apiKeyPrefix: record.apiKeyPrefix };
      } else return { kind: 'invalid' };

      await repos.refreshTokens.markUsed(record.id, now);
      const next = generateRefreshToken();
      const expiresAt = new Date(now.getTime() + this.refreshTtlMs);
      await repos.refreshTokens.create({ familyId: record.familyId, tokenHash: next.hash, role: record.role, accountId: record.accountId, createdAt: now, expiresAt });
      return { kind: 'ok', principal, refresh: { raw: next.raw, expiresAt } };
    });
    if (outcome.kind !== 'ok') {
      if (reusedFamily) this.onReuse(reusedFamily);
      throw refreshTokenInvalid();
    }
    return { response: await buildResponse(this.accessTokens, outcome.principal), refreshToken: outcome.refresh };
  }
}

/** POST /auth/logout - revokes the session (every refresh token of the family). Idempotent. */
export class RevokeSessionCommand {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  async execute(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    await this.transactions.run(async (repos) => {
      const record = await repos.refreshTokens.findByHashForUpdate(hashRefreshToken(rawRefreshToken));
      if (record) await repos.refreshTokens.revokeFamily(record.familyId, this.clock.now());
    });
  }
}
