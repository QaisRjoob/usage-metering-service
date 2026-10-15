import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { QuotaCheckRequest } from '@/models/consumption';
import { QUOTA_STATUSES, type QuotaStatus } from '@/models/quota';
import { useCredentials } from '@/hooks/useCredentials';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { useServices } from '@/providers/ServicesProvider';
import type { QuotasParams } from '@/services/quotaService';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

export function useQuotaViewModel() {
  const services = useServices();
  const { account } = useCredentials();
  const accountId = account?.accountId ?? '';
  const url = useSearchParamState();

  const statusParam = url.get('status');
  const params: QuotasParams = {
    page: url.getNumber('page', 1),
    pageSize: 10,
    search: url.get('search'),
    status: QUOTA_STATUSES.includes(statusParam as QuotaStatus) ? (statusParam as QuotaStatus) : undefined,
  };

  const [searchDraft, setSearchDraft] = useState(params.search ?? '');
  const debouncedSearch = useDebouncedValue(searchDraft, 350);
  useEffect(() => {
    if ((debouncedSearch.trim() || undefined) !== url.get('search')) url.set({ search: debouncedSearch.trim() || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const quotas = useQuery({
    queryKey: queryKeys.account.quotas(accountId, params),
    queryFn: () => services.quotas.getQuotas(params),
    enabled: Boolean(account),
    // Quota values change with every consume call; keep them fresh.
    staleTime: staleTimes.quota,
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
  });

  /** Dry run: evaluates both plans without consuming. Not cached - the backend answers each time. */
  const check = useMutation({ mutationFn: (request: QuotaCheckRequest) => services.quotas.checkQuota(request) });

  return {
    params,
    searchDraft,
    setSearchDraft,
    setStatus: (status: string) => url.set({ status: status || null }),
    setPage: (page: number) => url.set({ page }),
    quotas,
    check,
  };
}
