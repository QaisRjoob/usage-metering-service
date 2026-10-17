/**
 * The signed-in session: a JWT access token and who it belongs to.
 *
 * The access token lives in memory only - never in localStorage, sessionStorage, URLs or TanStack
 * Query keys - so a script that reads storage finds no credential. The refresh token is an
 * HttpOnly cookie the page cannot read at all. After a reload the session is restored by asking
 * the server for a new access token (POST /auth/refresh); a non-secret hint in sessionStorage
 * only says "there was a session in this tab, try to restore it".
 */
import type { SessionAccount as ApiSessionAccount, TokenResponse } from '@/contracts';

/** Who is signed in. Exactly one role at a time: the operator or one account (company). */
export type SessionRole = 'operator' | 'account';

export interface SessionAccount {
  accountId: string;
  accountName: string;
  apiKeyPrefix: string;
}

export interface CredentialsState {
  accessToken: string | null;
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number | null;
  role: SessionRole | null;
  account: SessionAccount | null;
  /** "restoring" while a reloaded tab asks the server for a fresh access token. */
  status: 'restoring' | 'ready';
}

const HINT_KEY = 'umqs.session-hint';
const EMPTY_STATE: CredentialsState = { accessToken: null, expiresAt: null, role: null, account: null, status: 'ready' };

function readHint(): boolean {
  try {
    return window.sessionStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeHint(present: boolean): void {
  try {
    if (present) window.sessionStorage.setItem(HINT_KEY, '1');
    else window.sessionStorage.removeItem(HINT_KEY);
  } catch {
    // Storage unavailable: a reload then simply shows the login page.
  }
}

let state: CredentialsState = typeof window !== 'undefined' && readHint() ? { ...EMPTY_STATE, status: 'restoring' } : EMPTY_STATE;
const listeners = new Set<() => void>();

function update(next: CredentialsState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

const toAccount = (account: ApiSessionAccount | undefined): SessionAccount | null =>
  account ? { accountId: account.id, accountName: account.name, apiKeyPrefix: account.apiKeyPrefix } : null;

export function roleOf(current: CredentialsState): SessionRole | null {
  return current.accessToken ? current.role : null;
}

export const credentials = {
  get(): CredentialsState {
    return state;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Stores a new session (sign-in or refresh). Signing in as one role ends the other. */
  setSession(session: Pick<TokenResponse, 'accessToken' | 'expiresIn' | 'role' | 'account'>): void {
    writeHint(true);
    update({
      accessToken: session.accessToken,
      expiresAt: Date.now() + session.expiresIn * 1000,
      role: session.role,
      account: session.role === 'account' ? toAccount(session.account) : null,
      status: 'ready',
    });
  },
  /** A reloaded tab could not be restored (no or expired refresh cookie). */
  restoreFailed(): void {
    writeHint(false);
    update(EMPTY_STATE);
  },
  /** Sign out (the caller also revokes the refresh token on the server). */
  clearAll(): void {
    writeHint(false);
    update(EMPTY_STATE);
  },
};
