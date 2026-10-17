/**
 * MOCK ADAPTER - implements AuthService with the same decisions as POST /auth/token, /refresh and
 * /logout. Mock access tokens are plain markers ("mock-access.operator", "mock-access.account.<id>")
 * that the mock services check; the "refresh cookie" is kept in sessionStorage (mock mode only -
 * the real refresh token is an HttpOnly cookie the page cannot read).
 */
import { ERROR_CODES, tokenRequestSchema, type TokenResponse } from '@/contracts';
import { ApiError } from '@/services/api/apiErrors';
import type { AuthService } from '@/services/authService';
import type { MockDatabase } from './mockDatabase';
import { MOCK_ADMIN_TOKEN } from './mockSeed';
import { mockAccountAccessToken, mockOperatorAccessToken, simulate, validate } from './mockRuntime';

const MOCK_REFRESH_KEY = 'umqs.mock-refresh';
const ACCESS_TTL_SECONDS = 900;

function sessionFor(db: MockDatabase, subject: string): TokenResponse | null {
  if (subject === 'operator') return { accessToken: mockOperatorAccessToken, tokenType: 'Bearer', expiresIn: ACCESS_TTL_SECONDS, role: 'operator' };
  const account = db.accounts.get(subject);
  if (!account) return null;
  return {
    accessToken: mockAccountAccessToken(account.id),
    tokenType: 'Bearer',
    expiresIn: ACCESS_TTL_SECONDS,
    role: 'account',
    account: { id: account.id, name: account.name, apiKeyPrefix: account.apiKeyPrefix },
  };
}

const unauthorized = (code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES], message: string) => new ApiError({ kind: 'http', status: 401, code, message, requestId: 'mock' });

function saveRefresh(subject: string | null): void {
  try {
    if (subject) window.sessionStorage.setItem(MOCK_REFRESH_KEY, subject);
    else window.sessionStorage.removeItem(MOCK_REFRESH_KEY);
  } catch {
    // storage unavailable: the mock session then ends on reload
  }
}

function readRefresh(): string | null {
  try {
    return window.sessionStorage.getItem(MOCK_REFRESH_KEY);
  } catch {
    return null;
  }
}

export function createMockAuthService(): AuthService {
  return {
    token: (credential) =>
      simulate((db) => {
        const { token } = validate(tokenRequestSchema, { token: credential });
        const subject = token === MOCK_ADMIN_TOKEN ? 'operator' : db.findAccountByKey(token)?.id;
        const session = subject ? sessionFor(db, subject) : null;
        if (!subject || !session) throw unauthorized(ERROR_CODES.CREDENTIAL_INVALID, 'This is neither a valid API key nor the operator token.');
        saveRefresh(subject);
        return session;
      }),
    refresh: () =>
      simulate((db) => {
        const subject = readRefresh();
        const session = subject ? sessionFor(db, subject) : null;
        if (!session) throw unauthorized(ERROR_CODES.REFRESH_TOKEN_INVALID, 'The session has ended. Sign in again.');
        return session;
      }),
    logout: () =>
      simulate(() => {
        saveRefresh(null);
      }),
  };
}
