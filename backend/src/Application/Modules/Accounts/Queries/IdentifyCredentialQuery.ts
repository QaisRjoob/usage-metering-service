import type { IdentifyCredentialResponse } from '../../../../contracts';
import { credentialInvalid } from '../../../../Domain/Accounts/AccountErrors';
import { apiKeyPrefixOf, looksLikeApiKey } from '../../../../Domain/Accounts/ApiKey';
import { isAppError } from '../../../../Shared/Errors/AppError';
import type { AuthenticateApiKeyQuery } from './AuthenticateApiKeyQuery';

/**
 * POST /auth/identify - lets the login page route people to the right interface from a single
 * field: the operator's admin token opens the operator console, an account API key opens that
 * account's portal. Anything else gets one generic 401, so a failed attempt does not reveal
 * whether it was close to an admin token or to an API key.
 */
export class IdentifyCredentialQuery {
  constructor(
    private readonly authenticate: AuthenticateApiKeyQuery,
    /** Constant-time comparison with ADMIN_API_TOKEN, injected by the composition root. */
    private readonly isAdminToken: (token: string) => boolean,
  ) {}

  async execute(token: string): Promise<IdentifyCredentialResponse> {
    if (this.isAdminToken(token)) return { role: 'operator' };
    if (looksLikeApiKey(token)) {
      try {
        const account = await this.authenticate.execute(token);
        return { role: 'account', account: { id: account.id, name: account.name, apiKeyPrefix: apiKeyPrefixOf(token) } };
      } catch (error) {
        if (!isAppError(error)) throw error;
      }
    }
    throw credentialInvalid();
  }
}
