/** MOCK ADAPTER - implements AuthService: same decision as POST /auth/identify. */
import { ERROR_CODES, identifyCredentialSchema } from '@/contracts';
import { ApiError } from '@/services/api/apiErrors';
import type { AuthService } from '@/services/authService';
import { MOCK_ADMIN_TOKEN } from './mockSeed';
import { simulate, validate } from './mockRuntime';

export function createMockAuthService(): AuthService {
  return {
    identify: (rawToken) =>
      simulate((db) => {
        const { token } = validate(identifyCredentialSchema, { token: rawToken });
        if (token === MOCK_ADMIN_TOKEN) return { role: 'operator' as const };
        const account = db.findAccountByKey(token);
        if (account) return { role: 'account' as const, account: { id: account.id, name: account.name, apiKeyPrefix: account.apiKeyPrefix } };
        throw new ApiError({
          kind: 'http',
          status: 401,
          code: ERROR_CODES.CREDENTIAL_INVALID,
          message: 'This is neither a valid API key nor the operator token.',
          requestId: 'mock',
        });
      }),
  };
}
