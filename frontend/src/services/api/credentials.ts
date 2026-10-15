/**
 * Holds the operator's admin token and the connected account's API key.
 *
 * Secrets live in memory and in sessionStorage only (cleared when the tab closes). They are never
 * written to localStorage, URLs or TanStack Query keys. Query keys use `account.accountId` as the
 * cache scope instead of the key itself.
 */

export interface AccountCredential {
  apiKey: string;
  accountId: string;
  accountName: string;
  apiKeyPrefix: string;
}

export interface CredentialsState {
  adminToken: string | null;
  account: AccountCredential | null;
}

const STORAGE_KEY = 'umqs.credentials';
const EMPTY_STATE: CredentialsState = { adminToken: null, account: null };

function isAccountCredential(value: unknown): value is AccountCredential {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return ['apiKey', 'accountId', 'accountName', 'apiKeyPrefix'].every((field) => typeof candidate[field] === 'string');
}

function load(): CredentialsState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_STATE;
    const record = parsed as Record<string, unknown>;
    return {
      adminToken: typeof record.adminToken === 'string' && record.adminToken ? record.adminToken : null,
      account: isAccountCredential(record.account) ? record.account : null,
    };
  } catch {
    return EMPTY_STATE;
  }
}

function persist(state: CredentialsState): void {
  try {
    if (!state.adminToken && !state.account) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private mode, blocked storage); memory state still works.
  }
}

let state: CredentialsState = typeof window === 'undefined' ? EMPTY_STATE : load();
const listeners = new Set<() => void>();

function update(next: CredentialsState): void {
  state = next;
  persist(state);
  listeners.forEach((listener) => listener());
}

export const credentials = {
  get(): CredentialsState {
    return state;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setAdminToken(token: string | null): void {
    update({ ...state, adminToken: token?.trim() || null });
  },
  setAccount(account: AccountCredential | null): void {
    update({ ...state, account });
  },
  clearAll(): void {
    update(EMPTY_STATE);
  },
};
