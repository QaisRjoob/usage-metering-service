import { useMutation } from '@tanstack/react-query';
import { useServices } from '@/providers/ServicesProvider';
import { credentials, type SessionRole } from '@/services/api/credentials';

/**
 * Single-field sign-in: the pasted credential (operator token or account API key) is exchanged for
 * a JWT access token (POST /auth/token); the server decides the role. Only the access token is
 * kept, in memory; the credential itself is not stored anywhere.
 */
export function useCredentialActions() {
  const services = useServices();

  const signIn = useMutation({
    mutationFn: async (rawToken: string): Promise<SessionRole> => {
      const session = await services.auth.token(rawToken.trim());
      credentials.setSession(session);
      return session.role;
    },
  });

  /** Revokes the refresh token on the server, then forgets the access token. */
  const signOut = async (): Promise<void> => {
    try {
      await services.auth.logout();
    } catch {
      // Already signed out on the server, or offline: the local session ends anyway.
    }
    credentials.clearAll();
  };

  return { signIn, signOut };
}
