import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ERROR_CODES } from '@/contracts';
import { isApiError } from '@/services/api/apiErrors';
import { credentials } from '@/services/api/credentials';

/**
 * Cache defaults. Individual queries override staleTime by data kind (see utils/queryKeys.ts):
 * quota and usage values are refreshed after a few seconds; plans and account lists live longer.
 */
/**
 * The stored credential was rejected (wrong or replaced admin token, or an API key that no longer
 * exists): end the session, so the route guard sends the user back to the login page instead of
 * leaving them on pages that can only fail. Missing credentials and login errors do not count.
 */
function endSessionOnRejectedCredential(error: unknown): void {
  if (isApiError(error) && error.status === 401 && (error.code === ERROR_CODES.ADMIN_TOKEN_INVALID || error.code === ERROR_CODES.API_KEY_INVALID)) {
    credentials.clearAll();
  }
}

/** Query and mutation caches that end the session on a rejected credential (also used by tests). */
// eslint-disable-next-line react-refresh/only-export-components
export function sessionAwareCaches() {
  return { queryCache: new QueryCache({ onError: endSessionOnRejectedCredential }), mutationCache: new MutationCache({ onError: endSessionOnRejectedCredential }) };
}

// eslint-disable-next-line react-refresh/only-export-components
export function createQueryClient(): QueryClient {
  return new QueryClient({
    ...sessionAwareCaches(),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          // Client errors (bad credentials, not found, validation) will not fix themselves.
          if (isApiError(error) && error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 429) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

/** Drops cached data whenever a credential changes, so no data outlives the key that fetched it. */
function useClearCacheOnCredentialChange(client: QueryClient): void {
  const previous = useRef(credentials.get());
  useEffect(
    () =>
      credentials.subscribe(() => {
        const next = credentials.get();
        if (previous.current.adminToken !== next.adminToken) client.removeQueries({ queryKey: ['admin'] });
        if (previous.current.account?.apiKey !== next.account?.apiKey) client.removeQueries({ queryKey: ['account'] });
        previous.current = next;
      }),
    [client],
  );
}

export function QueryProvider({ client, children }: { client?: QueryClient; children: ReactNode }) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  useClearCacheOnCredentialChange(queryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
