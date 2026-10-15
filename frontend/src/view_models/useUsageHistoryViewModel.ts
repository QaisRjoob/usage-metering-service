import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '@/models/pagination';
import type { AdminListUsageParams, UsageOutcome, UsageRecord } from '@/models/usage-record';
import { useCredentials } from '@/hooks/useCredentials';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { useServices } from '@/providers/ServicesProvider';
import { isValidIsoDate, isValidMonth } from '@/utils/dateUtils';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

export type HistoryScope = 'account' | 'admin';

export interface UsageFiltersValue {
  accountId?: string;
  userId?: string;
  outcome?: UsageOutcome;
  month?: string;
  from?: string;
  to?: string;
}

/**
 * History is paginated and filtered on the server. Filters live in the URL so a filtered view can
 * be shared or reloaded. `scope=admin` shows all accounts (admin token); otherwise the connected
 * account's history (API key).
 */
export function useUsageHistoryViewModel() {
  const services = useServices();
  const creds = useCredentials();
  const url = useSearchParamState();

  const requestedScope = url.get('scope');
  const scope: HistoryScope = requestedScope === 'admin' || (!creds.account && requestedScope !== 'account' && creds.adminToken) ? 'admin' : 'account';

  const outcomeParam = url.get('outcome');
  const filters: UsageFiltersValue = {
    accountId: scope === 'admin' ? url.get('accountId') : undefined,
    userId: url.get('userId'),
    outcome: outcomeParam === 'accepted' || outcomeParam === 'rejected' ? outcomeParam : undefined,
    month: isValidMonth(url.get('month')) ? url.get('month') : undefined,
    from: isValidIsoDate(url.get('from')) ? url.get('from') : undefined,
    to: isValidIsoDate(url.get('to')) ? url.get('to') : undefined,
  };
  const params: AdminListUsageParams = {
    ...filters,
    page: url.getNumber('page', 1),
    pageSize: url.getNumber('pageSize', DEFAULT_PAGE_SIZE),
  };
  const rangeError = filters.from && filters.to && filters.from > filters.to ? '"From" must be on or before "To".' : null;

  const history = useQuery({
    queryKey: scope === 'admin' ? queryKeys.admin.usage(params) : queryKeys.account.usage(creds.account?.accountId ?? '', params),
    queryFn: () => (scope === 'admin' ? services.usage.getAdminUsageHistory(params) : services.usage.getUsageHistory(params)),
    enabled: !rangeError && (scope === 'admin' ? Boolean(creds.adminToken) : Boolean(creds.account)),
    staleTime: staleTimes.usage,
    placeholderData: keepPreviousData,
  });

  const [selected, setSelected] = useState<UsageRecord | null>(null);

  return {
    scope,
    setScope: (next: HistoryScope) => url.set({ scope: next, accountId: null }),
    canUseAdmin: Boolean(creds.adminToken),
    canUseAccount: Boolean(creds.account),
    filters,
    rangeError,
    applyFilters: (next: UsageFiltersValue) =>
      url.set({
        accountId: next.accountId ?? null,
        userId: next.userId ?? null,
        outcome: next.outcome ?? null,
        month: next.month ?? null,
        from: next.from ?? null,
        to: next.to ?? null,
      }),
    clearFilters: () => url.set({ accountId: null, userId: null, outcome: null, month: null, from: null, to: null }),
    params,
    setPage: (page: number) => url.set({ page }),
    setPageSize: (pageSize: number) => url.set({ pageSize }),
    history,
    selected,
    select: setSelected,
  };
}
