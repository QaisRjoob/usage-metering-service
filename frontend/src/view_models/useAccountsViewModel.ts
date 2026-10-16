import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CreateAccountRequest, CreateAccountResponse } from '@/models/account';
import { listAccountsQuerySchema } from '@/models/account';
import { useListQuery } from '@/hooks/useListQuery';
import { useServices } from '@/providers/ServicesProvider';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

/** URL filter keys for the accounts list (validated by the shared listAccountsQuerySchema DTO). */
export const ACCOUNT_FILTER_FIELDS = [
  'search',
  'status',
  'activity',
  'planId',
  'planKind',
  'hasRejections',
  'minUsers',
  'maxUsers',
  'minUtilization',
  'maxUtilization',
  'createdFrom',
  'createdTo',
  'month',
] as const;

export function useAccountsViewModel() {
  const services = useServices();
  const queryClient = useQueryClient();
  const list = useListQuery(listAccountsQuerySchema, ACCOUNT_FILTER_FIELDS, { pageSize: 20, sort: 'createdAt', order: 'desc' });

  const accounts = useQuery({
    queryKey: queryKeys.admin.accounts(list.query ?? {}),
    queryFn: () => services.accounts.listAccounts(list.query!),
    enabled: list.isValid,
    staleTime: staleTimes.accounts,
    placeholderData: keepPreviousData,
  });

  // Category counts follow the search text and month only, so each tab shows what clicking it gives.
  const facetParams = { search: list.query?.search, month: list.query?.month };
  const facets = useQuery({
    queryKey: queryKeys.admin.accountFacets(facetParams),
    queryFn: () => services.directory.accountFacets(facetParams),
    enabled: list.isValid,
    staleTime: staleTimes.accounts,
    placeholderData: keepPreviousData,
  });

  // Account plans for the "Plan" filter: predefined plus every custom account plan.
  const planParams = { scope: 'account' as const, page: 1, pageSize: 100, sort: 'name' as const, order: 'asc' as const };
  const plans = useQuery({
    queryKey: queryKeys.admin.plans(planParams),
    queryFn: () => services.plans.listAllPlans(planParams),
    staleTime: staleTimes.plans,
  });

  const [createdAccount, setCreatedAccount] = useState<CreateAccountResponse | null>(null);
  const createAccount = useMutation({
    mutationFn: (request: CreateAccountRequest) => services.accounts.createAccount(request),
    onSuccess: (result) => {
      setCreatedAccount(result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
    },
  });

  return {
    list,
    accounts,
    facets,
    planOptions: (plans.data?.items ?? []).map((plan) => ({
      value: plan.id,
      label: plan.isPredefined ? `${plan.name} (predefined)` : `${plan.name} — ${plan.ownerAccountName ?? 'custom'}`,
    })),
    planName: (planId: string) => plans.data?.items.find((plan) => plan.id === planId)?.name ?? 'selected plan',
    createAccount,
    createdAccount,
    dismissCreatedAccount: () => {
      setCreatedAccount(null);
      createAccount.reset();
    },
  };
}
