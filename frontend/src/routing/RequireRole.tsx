import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useCredentials } from '@/hooks/useCredentials';
import { roleOf, type SessionRole } from '@/services/api/credentials';
import { homeFor, routePaths } from './routePaths';

/**
 * Route guard. Not signed in -> login page (remembering where you were going).
 * Signed in with the other role -> that role's own home: an account never sees operator pages and
 * the operator never sees account pages. The API enforces the same separation independently.
 */
export function RequireRole({ role, children }: { role: SessionRole; children: ReactNode }) {
  const session = useCredentials();
  const location = useLocation();
  const current = roleOf(session);
  if (!current) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`${routePaths.login}?next=${next}`} replace />;
  }
  if (current !== role) return <Navigate to={homeFor(current)} replace />;
  return <>{children}</>;
}

/** "/" sends people to their own interface, or to the login page. */
export function HomeRedirect() {
  const current = roleOf(useCredentials());
  return <Navigate to={current ? homeFor(current) : routePaths.login} replace />;
}
