import { useMutation } from '@tanstack/react-query';
import { useServices } from '@/providers/ServicesProvider';
import { credentials, type SessionRole } from '@/services/api/credentials';

/**
 * Single-field sign-in: the server identifies the token (POST /auth/identify) and the matching
 * session is stored - operator token or account API key. Nothing is stored for an unknown token.
 */
export function useCredentialActions() {
  const services = useServices();

  const signIn = useMutation({
    mutationFn: async (rawToken: string): Promise<SessionRole> => {
      const token = rawToken.trim();
      const identity = await services.auth.identify(token);
      if (identity.role === 'operator') {
        credentials.setAdminToken(token);
        return 'operator';
      }
      credentials.setAccount({ apiKey: token, accountId: identity.account.id, accountName: identity.account.name, apiKeyPrefix: identity.account.apiKeyPrefix });
      return 'account';
    },
  });

  return { signIn, signOut: () => credentials.clearAll() };
}
