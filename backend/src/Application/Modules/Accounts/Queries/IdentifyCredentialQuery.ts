import { credentialInvalid } from '../../../../Domain/Accounts/AccountErrors';
import { apiKeyPrefixOf, looksLikeApiKey } from '../../../../Domain/Accounts/ApiKey';
import type { Principal } from '../../../../Domain/Auth/AuthTokens';
import { isAppError } from '../../../../Shared/Errors/AppError';
import type { AuthenticateApiKeyQuery } from './AuthenticateApiKeyQuery';

/**
 * Decides who a pasted credential belongs to (used by POST /auth/token): the operator token, or an
 * account API key. Anything else gets one generic 401, so a failed attempt does not reveal whether
 * it was close to the operator token or to an API key.
 */
export class IdentifyCredentialQuery {
  constructor(
    private readonly authenticate: AuthenticateApiKeyQuery,
    /** Constant-time comparison with ADMIN_API_TOKEN, injected by the composition root. */
    private readonly isOperatorToken: (token: string) => boolean,
  ) {}

  async execute(token: string): Promise<Principal> {
    if (this.isOperatorToken(token)) return { role: 'operator' };
    if (looksLikeApiKey(token)) {
      try {
        const account = await this.authenticate.execute(token);
        return { role: 'account', accountId: account.id, accountName: account.name, apiKeyPrefix: apiKeyPrefixOf(token) };
      } catch (error) {
        if (!isAppError(error)) throw error;
      }
    }
    throw credentialInvalid();
  }
}
