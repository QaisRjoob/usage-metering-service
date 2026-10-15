import type { AuthenticatedAccount } from '../../../../Domain/Accounts/Account';
import { apiKeyInvalid, apiKeyMissing } from '../../../../Domain/Accounts/AccountErrors';
import { hashApiKey, looksLikeApiKey } from '../../../../Domain/Accounts/ApiKey';
import type { AccountRepository } from '../Interfaces/AccountRepository';

/**
 * Resolves the X-API-Key header to an account. The key is hashed and looked up by hash; the raw key
 * is never stored or logged. The key alone identifies the account - an account id from the client
 * is never accepted instead.
 */
export class AuthenticateApiKeyQuery {
  constructor(private readonly accounts: Pick<AccountRepository, 'findByApiKeyHash'>) {}

  async execute(rawKey: string | undefined): Promise<AuthenticatedAccount> {
    const key = rawKey?.trim();
    if (!key) throw apiKeyMissing();
    if (!looksLikeApiKey(key)) throw apiKeyInvalid();
    const account = await this.accounts.findByApiKeyHash(hashApiKey(key));
    if (!account) throw apiKeyInvalid();
    return account;
  }
}
