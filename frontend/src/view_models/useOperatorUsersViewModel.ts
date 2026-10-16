import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { adminListUsersQuerySchema } from '@/models/directory';
import { useListQuery } from '@/hooks/useListQuery';
import { useServices } from '@/providers/ServicesProvider';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

/** URL filter keys for the users directory (validated by the shared adminListUsersQuerySchema DTO). */
export const OPERATOR_USER_FILTER_FIELDS = ['search', 'accountId', 'status', 'activity', 'planId', 'minUtilization', 'maxUtilization', 'createdFrom', 'createdTo', 'month'] as const;

/** Operator: users of every company, with category counts and server-side filters. */
export function useOperatorUsersViewModel() {
  const services = useServices();
  const list = useListQuery(adminListUsersQuerySchema, OPERATOR_USER_FILTER_FIELDS, { pageSize: 20, sort: 'lastActivity', order: 'desc' });

  const users = useQuery({
    queryKey: queryKeys.admin.users(list.query ?? {}),
    queryFn: () => services.directory.listUsers(list.query!),
    enabled: list.isValid,
    staleTime: staleTimes.accounts,
    placeholderData: keepPreviousData,
  });

  // Counts follow the search text, the company and the month, not the category being picked.
  const facetParams = { search: list.query?.search, accountId: list.query?.accountId, month: list.query?.month };
  const facets = useQuery({
    queryKey: queryKeys.admin.userFacets(facetParams),
    queryFn: () => services.directory.userFacets(facetParams),
    enabled: list.isValid,
    staleTime: staleTimes.accounts,
    placeholderData: keepPreviousData,
  });

  return {
    list,
    users,
    facets,
    planName: (planId: string) => facets.data?.byPlan.find((plan) => plan.planId === planId)?.planName ?? 'selected plan',
  };
}
