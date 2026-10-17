import { useEffect, type ReactNode } from 'react';
import { useServices } from '@/providers/ServicesProvider';
import { credentials } from '@/services/api/credentials';

/**
 * After a reload the access token (kept in memory only) is gone. If this tab had a session, ask the
 * server for a new one with the HttpOnly refresh cookie; until then the route guards wait.
 */
export function SessionRestorer({ children }: { children: ReactNode }) {
  const { auth } = useServices();
  useEffect(() => {
    if (credentials.get().status !== 'restoring') return;
    let active = true;
    auth
      .refresh()
      .then((session) => active && credentials.setSession(session))
      .catch(() => active && credentials.restoreFailed());
    return () => {
      active = false;
    };
  }, [auth]);
  return <>{children}</>;
}
