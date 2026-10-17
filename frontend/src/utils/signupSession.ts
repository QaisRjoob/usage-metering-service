import type { SignupCredentials } from '@/contracts';

const KEY = 'umk-signup-request';

/**
 * The applicant's request id + claim code, kept in sessionStorage (this tab only, like the API
 * key) so the status page can be opened right after submitting. Never put in a URL.
 */
export const signupSession = {
  save(credentials: SignupCredentials): void {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(credentials));
    } catch {
      // storage unavailable: the applicant types the values in
    }
  },
  load(): SignupCredentials | null {
    try {
      const raw = window.sessionStorage.getItem(KEY);
      const value = raw ? (JSON.parse(raw) as Partial<SignupCredentials>) : null;
      return value?.requestId && value.claimCode ? { requestId: value.requestId, claimCode: value.claimCode } : null;
    } catch {
      return null;
    }
  },
  clear(): void {
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  },
};
