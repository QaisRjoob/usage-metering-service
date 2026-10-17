import { randomUUID } from 'node:crypto';
import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';
import type { AccessTokenClaims } from '../../contracts';
import type { Clock } from '../../Application/Common/Clock';
import type { AccessTokenService } from '../../Application/Modules/Auth/Interfaces/AuthPorts';
import { tokenExpired, tokenInvalid, type Principal } from '../../Domain/Auth/AuthTokens';

export const JWT_ISSUER = 'usage-metering';
export const JWT_AUDIENCE = 'usage-metering-api';
const ALGORITHM = 'HS256';

/**
 * JWT access tokens (HS256, symmetric secret: the API is the only issuer and the only verifier).
 * Verification pins the algorithm, issuer and audience and checks expiry against the injected
 * clock, so a token signed with another algorithm ("none", RS256 key confusion) is rejected.
 */
export class JoseAccessTokenService implements AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlSeconds: number,
    private readonly clock: Clock,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async issue(principal: Principal): Promise<{ token: string; expiresIn: number }> {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const claims = principal.role === 'account' ? { role: principal.role, name: principal.accountName, kp: principal.apiKeyPrefix } : { role: principal.role };
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setSubject(principal.role === 'account' ? principal.accountId : 'operator')
      .setIssuedAt(now)
      .setExpirationTime(now + this.ttlSeconds)
      .setJti(randomUUID())
      .sign(this.key);
    return { token, expiresIn: this.ttlSeconds };
  }

  async verify(token: string): Promise<Principal> {
    let claims: AccessTokenClaims;
    try {
      const result = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        currentDate: this.clock.now(),
        clockTolerance: 5,
        requiredClaims: ['sub', 'exp', 'iat', 'jti'],
      });
      claims = result.payload as unknown as AccessTokenClaims;
    } catch (error) {
      if (error instanceof joseErrors.JWTExpired) throw tokenExpired();
      throw tokenInvalid();
    }
    if (claims.role === 'operator' && claims.sub === 'operator') return { role: 'operator' };
    if (claims.role === 'account' && typeof claims.name === 'string' && typeof claims.kp === 'string') {
      return { role: 'account', accountId: claims.sub, accountName: claims.name, apiKeyPrefix: claims.kp };
    }
    throw tokenInvalid();
  }
}
