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
 * The session was rejected (an invalid access token, a refresh that failed, or an account that no
 * longer exists): end it, so the route guard sends the user back to the login page instead of
 * leaving them on pages that can only fail. An expired access token is refreshed by the API client
 * before it gets here; missing credentials and login errors do not count.
 */
const SESSION_ENDING_CODES = new Set<string>([ERROR_CODES.TOKEN_INVALID, ERROR_CODES.REFRESH_TOKEN_INVALID, ERROR_CODES.API_KEY_INVALID]);

function endSessionOnRejectedCredential(error: unknown): void {
  if (isApiError(error) && error.status === 401 && SESSION_ENDING_CODES.has(error.code)) credentials.clearAll();
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

/**
 * Drops cached data whenever the signed-in identity changes (role or account), so no data outlives
 * the session that fetched it. A refreshed access token for the same identity keeps the cache.
 */
function useClearCacheOnCredentialChange(client: QueryClient): void {
  const previous = useRef(credentials.get());
  useEffect(
    () =>
      credentials.subscribe(() => {
        const next = credentials.get();
        const wasOperator = previous.current.role === 'operator' && previous.current.accessToken !== null;
        const isOperator = next.role === 'operator' && next.accessToken !== null;
        if (wasOperator !== isOperator) client.removeQueries({ queryKey: ['admin'] });
        const previousAccount = previous.current.accessToken ? previous.current.account?.accountId : undefined;
        const nextAccount = next.accessToken ? next.account?.accountId : undefined;
        if (previousAccount !== nextAccount) client.removeQueries({ queryKey: ['account'] });
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
