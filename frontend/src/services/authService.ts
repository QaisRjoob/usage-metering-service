import type { IdentifyCredentialResponse } from '@/contracts';
import { apiRequest } from './api/apiClient';
import { endpoints } from './api/endpoints';

/** Login: the server decides whether a token is the operator token or an account API key. */
export interface AuthService {
  identify(token: string): Promise<IdentifyCredentialResponse>;
}

export function createHttpAuthService(): AuthService {
  return {
    // Token in the JSON body (never in the URL); no credential header is needed for this call.
    identify: (token) => apiRequest(endpoints.auth.identify, { method: 'POST', auth: 'none', body: { token } }),
  };
}
