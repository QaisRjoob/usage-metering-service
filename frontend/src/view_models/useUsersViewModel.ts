import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateUserRequest } from '@/models/user';
import { listUsersQuerySchema } from '@/models/user';
import { useCredentials } from '@/hooks/useCredentials';
import { useListQuery } from '@/hooks/useListQuery';
import { useServices } from '@/providers/ServicesProvider';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

export const USER_FILTER_FIELDS = ['search', 'status', 'activity', 'planId', 'hasRejections', 'minUtilization', 'maxUtilization', 'createdFrom', 'createdTo', 'month'] as const;

/** Account portal: the company's own users - list with filters, register, change plan. */
export function useUsersViewModel() {
  const services = useServices();
  const queryClient = useQueryClient();
  const { account } = useCredentials();
  const accountId = account?.accountId ?? '';
  const list = useListQuery(listUsersQuerySchema, USER_FILTER_FIELDS, { pageSize: 20, sort: 'externalUserId', order: 'asc' });

  const users = useQuery({
    queryKey: queryKeys.account.users(accountId, list.query ?? {}),
    queryFn: () => services.users.listUsers(list.query!),
    enabled: list.isValid,
    staleTime: staleTimes.quota,
    placeholderData: keepPreviousData,
  });

  // Category counts follow the search text and month only.
  const facetParams = { search: list.query?.search, month: list.query?.month };
  const facets = useQuery({
    queryKey: queryKeys.account.userFacets(accountId, facetParams),
    queryFn: () => services.users.userFacets(facetParams),
    enabled: list.isValid,
    staleTime: staleTimes.quota,
    placeholderData: keepPreviousData,
  });

  const plansParams = { page: 1, pageSize: 100 };
  const plans = useQuery({
    queryKey: queryKeys.account.plans(accountId, plansParams),
    queryFn: () => services.plans.listPlans(plansParams),
    staleTime: staleTimes.plans,
  });
  const allPlans = plans.data?.items ?? [];
  const userPlans = allPlans.filter((plan) => plan.scope === 'user');

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.account.all(accountId) });
  const createUser = useMutation({ mutationFn: (request: CreateUserRequest) => services.users.createUser(request), onSuccess: invalidate });
  const assignUserPlan = useMutation({
    mutationFn: ({ userId, planId }: { userId: string; planId: string }) => services.users.assignUserPlan(userId, planId),
    onSuccess: invalidate,
  });

  return {
    list,
    users,
    facets,
    plans: allPlans,
    planOptions: userPlans.map((plan) => ({ value: plan.id, label: plan.isPredefined ? plan.name : `${plan.name} (custom)` })),
    planName: (planId: string) => userPlans.find((plan) => plan.id === planId)?.name ?? 'selected plan',
    createUser,
    assignUserPlan,
  };
}
