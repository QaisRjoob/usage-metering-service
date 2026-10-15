import { useMutation } from '@tanstack/react-query';
import { useServices } from '@/providers/ServicesProvider';
import { credentials } from '@/services/api/credentials';

/** Connect / verify credentials. A credential is stored only after the service accepted it. */
export function useCredentialActions() {
  const services = useServices();

  const connectAccount = useMutation({
    mutationFn: async (apiKey: string) => {
      const trimmed = apiKey.trim();
      const result = await services.accounts.verifyApiKey(trimmed);
      credentials.setAccount({
        apiKey: trimmed,
        accountId: result.account.id,
        accountName: result.account.name,
        apiKeyPrefix: result.account.apiKeyPrefix,
      });
      return result;
    },
  });

  const connectAdmin = useMutation({
    mutationFn: async (token: string) => {
      await services.analytics.verifyAdminToken(token.trim());
      credentials.setAdminToken(token);
    },
  });

  return {
    connectAccount,
    connectAdmin,
    disconnectAccount: () => credentials.setAccount(null),
    disconnectAdmin: () => credentials.setAdminToken(null),
  };
}
