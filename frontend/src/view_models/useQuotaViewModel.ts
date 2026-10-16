import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type { QuotaCheckRequest } from '@/models/consumption';
import { quotasQuerySchema } from '@/models/user';
import { useCredentials } from '@/hooks/useCredentials';
import { useListQuery } from '@/hooks/useListQuery';
import { useServices } from '@/providers/ServicesProvider';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

export const QUOTA_FILTER_FIELDS = ['search', 'status', 'planId', 'minUtilization', 'maxUtilization'] as const;

export function useQuotaViewModel() {
  const services = useServices();
  const { account } = useCredentials();
  const accountId = account?.accountId ?? '';
  const list = useListQuery(quotasQuerySchema, QUOTA_FILTER_FIELDS, { pageSize: 10, sort: 'utilization', order: 'desc' });

  const quotas = useQuery({
    queryKey: queryKeys.account.quotas(accountId, list.query ?? {}),
    queryFn: () => services.quotas.getQuotas(list.query!),
    enabled: list.isValid,
    // Quota values change with every consume call; keep them fresh.
    staleTime: staleTimes.quota,
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
  });

  const plansParams = { scope: 'user' as const, page: 1, pageSize: 100 };
  const plans = useQuery({
    queryKey: queryKeys.account.plans(accountId, plansParams),
    queryFn: () => services.plans.listPlans(plansParams),
    staleTime: staleTimes.plans,
  });
  const userPlans = plans.data?.items ?? [];

  /** Dry run: evaluates both plans without consuming. Not cached - the backend answers each time. */
  const check = useMutation({ mutationFn: (request: QuotaCheckRequest) => services.quotas.checkQuota(request) });

  return {
    list,
    quotas,
    check,
    planOptions: userPlans.map((plan) => ({ value: plan.id, label: plan.isPredefined ? plan.name : `${plan.name} (custom)` })),
    planName: (planId: string) => userPlans.find((plan) => plan.id === planId)?.name ?? 'selected plan',
  };
}
