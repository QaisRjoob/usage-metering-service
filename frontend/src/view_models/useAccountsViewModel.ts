import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { AccountSortField, CreateAccountRequest, CreateAccountResponse, ListAccountsParams } from '@/models/account';
import { ACCOUNT_SORT_FIELDS } from '@/models/account';
import { DEFAULT_PAGE_SIZE } from '@/models/pagination';
import { QUOTA_STATUSES, type QuotaStatus } from '@/models/quota';
import { useCredentials } from '@/hooks/useCredentials';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { useServices } from '@/providers/ServicesProvider';
import { credentials } from '@/services/api/credentials';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

const isStatus = (value: string | undefined): value is QuotaStatus => QUOTA_STATUSES.includes(value as QuotaStatus);
const isSortField = (value: string | undefined): value is AccountSortField => ACCOUNT_SORT_FIELDS.includes(value as AccountSortField);

export function useAccountsViewModel() {
  const services = useServices();
  const queryClient = useQueryClient();
  const { adminToken } = useCredentials();
  const url = useSearchParamState();

  const statusParam = url.get('status');
  const sortParam = url.get('sort');
  const params: ListAccountsParams = {
    page: url.getNumber('page', 1),
    pageSize: url.getNumber('pageSize', DEFAULT_PAGE_SIZE),
    search: url.get('search'),
    status: isStatus(statusParam) ? statusParam : undefined,
    sort: isSortField(sortParam) ? sortParam : 'createdAt',
    order: url.get('order') === 'asc' ? 'asc' : 'desc',
  };

  // Search box: local draft, debounced into the URL (which resets the page).
  const [searchDraft, setSearchDraft] = useState(params.search ?? '');
  const debouncedSearch = useDebouncedValue(searchDraft, 350);
  useEffect(() => {
    if ((debouncedSearch.trim() || undefined) !== params.search) url.set({ search: debouncedSearch.trim() || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const query = useQuery({
    queryKey: queryKeys.admin.accounts(params),
    queryFn: () => services.accounts.listAccounts(params),
    enabled: Boolean(adminToken),
    staleTime: staleTimes.accounts,
    placeholderData: keepPreviousData,
  });

  // If the total shrank (e.g. a filter elsewhere), step back to the last existing page.
  const totalPages = query.data?.totalPages;
  useEffect(() => {
    if (totalPages !== undefined && totalPages > 0 && (params.page ?? 1) > totalPages) url.set({ page: totalPages });
  }, [totalPages, params.page, url]);

  const [createdAccount, setCreatedAccount] = useState<CreateAccountResponse | null>(null);
  const createAccount = useMutation({
    mutationFn: (request: CreateAccountRequest) => services.accounts.createAccount(request),
    onSuccess: (result) => {
      setCreatedAccount(result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
    },
  });

  return {
    params,
    searchDraft,
    setSearchDraft,
    setStatus: (status: string) => url.set({ status: status || null }),
    setSort: (sort: string) => {
      const [field, order] = sort.split(':');
      url.set({ sort: field ?? null, order: order ?? null });
    },
    setPage: (page: number) => url.set({ page }),
    setPageSize: (pageSize: number) => url.set({ pageSize }),
    accounts: query.data,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
    createAccount,
    createdAccount,
    dismissCreatedAccount: () => {
      setCreatedAccount(null);
      createAccount.reset();
    },
    /** Uses the freshly issued key as this tab's account credential (the key is still shown only once). */
    connectCreatedAccount: () => {
      if (!createdAccount) return;
      credentials.setAccount({
        apiKey: createdAccount.apiKey,
        accountId: createdAccount.account.id,
        accountName: createdAccount.account.name,
        apiKeyPrefix: createdAccount.account.apiKeyPrefix,
      });
    },
  };
}
