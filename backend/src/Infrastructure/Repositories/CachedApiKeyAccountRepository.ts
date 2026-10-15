import type { AccountRepository } from '../../Application/Modules/Accounts/Interfaces/AccountRepository';
import type { AuthenticatedAccount } from '../../Domain/Accounts/Account';

/**
 * Caches successful API-key lookups (key hash -> account id and name) for a short time, saving one
 * database round trip per request on the hot consume path.
 *
 * Why this is safe here: a key's hash maps to one account forever - the service has no key
 * rotation or account deletion. Unknown keys are never cached, so a newly created account works
 * immediately. A renamed account would show its old name in logs for at most `ttlMs`; quota
 * decisions never use the cached data except the account id. If key rotation is added later,
 * the rotation command must call `invalidate`.
 */
export class CachedApiKeyAccountRepository {
  private readonly cache = new Map<string, { account: AuthenticatedAccount; expiresAt: number }>();

  constructor(
    private readonly inner: Pick<AccountRepository, 'findByApiKeyHash'>,
    private readonly ttlMs = 60_000,
    private readonly maxEntries = 10_000,
  ) {}

  async findByApiKeyHash(apiKeyHash: string): Promise<AuthenticatedAccount | null> {
    const hit = this.cache.get(apiKeyHash);
    if (hit && hit.expiresAt > Date.now()) return hit.account;
    const account = await this.inner.findByApiKeyHash(apiKeyHash);
    if (account) {
      if (this.cache.size >= this.maxEntries) this.cache.delete(this.cache.keys().next().value as string);
      this.cache.set(apiKeyHash, { account, expiresAt: Date.now() + this.ttlMs });
    } else {
      this.cache.delete(apiKeyHash);
    }
    return account;
  }

  invalidate(apiKeyHash: string): void {
    this.cache.delete(apiKeyHash);
  }
}
