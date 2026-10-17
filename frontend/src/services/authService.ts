import { CSRF_HEADER, CSRF_HEADER_VALUE, type TokenResponse } from '@/contracts';
import { apiRequest } from './api/apiClient';
import { endpoints } from './api/endpoints';

/**
 * JWT sessions. `token` exchanges the pasted credential (operator token or account API key) for an
 * access token; the server sets the refresh token as an HttpOnly cookie, which `refresh` and
 * `logout` send automatically (with the CSRF header those routes require).
 */
export interface AuthService {
  token(credential: string): Promise<TokenResponse>;
  refresh(): Promise<TokenResponse>;
  logout(): Promise<void>;
}

const csrf = { [CSRF_HEADER]: CSRF_HEADER_VALUE };

export function createHttpAuthService(): AuthService {
  return {
    // The credential travels in the JSON body (never in the URL).
    token: (credential) => apiRequest(endpoints.auth.token, { method: 'POST', auth: 'none', body: { token: credential } }),
    refresh: () => apiRequest(endpoints.auth.refresh, { method: 'POST', auth: 'none', headers: csrf }),
    logout: () => apiRequest(endpoints.auth.logout, { method: 'POST', auth: 'none', headers: csrf }),
  };
}
