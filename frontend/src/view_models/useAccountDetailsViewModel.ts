import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listUsersQuerySchema } from '@/models/user';
import { useListQuery } from '@/hooks/useListQuery';
import { useServices } from '@/providers/ServicesProvider';
import { currentUtcMonth } from '@/utils/dateUtils';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

export const ACCOUNT_USER_FILTER_FIELDS = ['search', 'status', 'activity', 'planId', 'hasRejections', 'minUtilization', 'maxUtilization', 'createdFrom', 'createdTo', 'month'] as const;

/**
 * Operator view of one account: read-only. Users are managed by the account itself in its own
 * portal; the operator sees the account, its users (filterable) and recent requests.
 */
export function useAccountDetailsViewModel(accountId: string) {
  const services = useServices();
  const list = useListQuery(listUsersQuerySchema, ACCOUNT_USER_FILTER_FIELDS, { pageSize: 10, sort: 'externalUserId', order: 'asc' });
  const month = list.filters.month ?? currentUtcMonth();

  const account = useQuery({
    queryKey: queryKeys.admin.account(accountId, month),
    queryFn: () => services.accounts.getAccount(accountId, month),
    staleTime: staleTimes.quota,
    placeholderData: keepPreviousData,
  });

  const users = useQuery({
    queryKey: queryKeys.admin.accountUsers(accountId, list.query ?? {}),
    queryFn: () => services.accounts.listAccountUsers(accountId, list.query!),
    enabled: list.isValid,
    staleTime: staleTimes.quota,
    placeholderData: keepPreviousData,
  });

  // User plans this account can use (predefined + its own custom plans) for the plan filter.
  const plansParams = { scope: 'user' as const, page: 1, pageSize: 100 };
  const predefined = useQuery({
    queryKey: queryKeys.admin.plans({ ...plansParams, kind: 'predefined' }),
    queryFn: () => services.plans.listAllPlans({ ...plansParams, kind: 'predefined' }),
    staleTime: staleTimes.plans,
  });
  const custom = useQuery({
    queryKey: queryKeys.admin.plans({ ...plansParams, ownerAccountId: accountId }),
    queryFn: () => services.plans.listAllPlans({ ...plansParams, ownerAccountId: accountId }),
    staleTime: staleTimes.plans,
  });
  const userPlans = [...(predefined.data?.items ?? []), ...(custom.data?.items ?? [])];

  // Category counts of this company's users (status, activity, plan) within the search and month.
  const facetParams = { accountId, search: list.query?.search, month };
  const userFacets = useQuery({
    queryKey: queryKeys.admin.userFacets(facetParams),
    queryFn: () => services.directory.userFacets(facetParams),
    enabled: list.isValid,
    staleTime: staleTimes.quota,
    placeholderData: keepPreviousData,
  });

  // Company statistics: requests, daily series, rejections by rule, top users and a 6-month trend.
  const summary = useQuery({
    queryKey: queryKeys.admin.accountSummary(accountId, month),
    queryFn: () => services.directory.accountUsageSummary(accountId, month),
    staleTime: staleTimes.summary,
    placeholderData: keepPreviousData,
  });

  const recentParams = { accountId, month, page: 1, pageSize: 8 };
  const recent = useQuery({
    queryKey: queryKeys.admin.usage(recentParams),
    queryFn: () => services.usage.getAdminUsageHistory(recentParams),
    staleTime: staleTimes.usage,
  });

  return {
    accountId,
    month,
    list,
    account,
    summary,
    users,
    userFacets,
    recent,
    planOptions: userPlans.map((plan) => ({ value: plan.id, label: plan.isPredefined ? plan.name : `${plan.name} (custom)` })),
    planName: (planId: string) => userPlans.find((plan) => plan.id === planId)?.name ?? 'selected plan',
  };
}
