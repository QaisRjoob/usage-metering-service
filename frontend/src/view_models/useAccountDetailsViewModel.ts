import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ListUsersParams, CreateUserRequest } from '@/models/user';
import { useCredentials } from '@/hooks/useCredentials';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { useServices } from '@/providers/ServicesProvider';
import { currentUtcMonth, isValidMonth } from '@/utils/dateUtils';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

/**
 * Account details combine two scopes:
 * - read-only operator data (admin token): account, its users and recent records, for any month;
 * - management actions (register user, change plans), which require that account's own API key,
 *   exactly as the calling application would use it.
 */
export function useAccountDetailsViewModel(accountId: string) {
  const services = useServices();
  const queryClient = useQueryClient();
  const creds = useCredentials();
  const url = useSearchParamState();

  const monthParam = url.get('month');
  const month = isValidMonth(monthParam) ? monthParam : currentUtcMonth();
  const isCurrentMonth = month === currentUtcMonth();
  const canManage = creds.account?.accountId === accountId;

  const [searchDraft, setSearchDraft] = useState(url.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(searchDraft, 350);
  useEffect(() => {
    if ((debouncedSearch.trim() || undefined) !== url.get('search')) url.set({ search: debouncedSearch.trim() || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const userParams: ListUsersParams = { page: url.getNumber('page', 1), pageSize: 10, search: url.get('search'), month };
  const enabled = Boolean(creds.adminToken);

  const account = useQuery({
    queryKey: queryKeys.admin.account(accountId, month),
    queryFn: () => services.accounts.getAccount(accountId, month),
    enabled,
    staleTime: staleTimes.quota,
    placeholderData: keepPreviousData,
  });

  const users = useQuery({
    queryKey: queryKeys.admin.accountUsers(accountId, userParams),
    queryFn: () => services.accounts.listAccountUsers(accountId, userParams),
    enabled,
    staleTime: staleTimes.quota,
    placeholderData: keepPreviousData,
  });

  const recentParams = { accountId, month, page: 1, pageSize: 8 };
  const recent = useQuery({
    queryKey: queryKeys.admin.usage(recentParams),
    queryFn: () => services.usage.getAdminUsageHistory(recentParams),
    enabled,
    staleTime: staleTimes.usage,
  });

  // Plans the account can assign (predefined + its custom plans) - account scope.
  const plansParams = { page: 1, pageSize: 100 };
  const plans = useQuery({
    queryKey: queryKeys.account.plans(accountId, plansParams),
    queryFn: () => services.plans.listPlans(plansParams),
    enabled: canManage,
    staleTime: staleTimes.plans,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.account.all(accountId) });
  };

  const createUser = useMutation({ mutationFn: (request: CreateUserRequest) => services.users.createUser(request), onSuccess: invalidate });
  const assignUserPlan = useMutation({
    mutationFn: ({ userId, planId }: { userId: string; planId: string }) => services.users.assignUserPlan(userId, planId),
    onSuccess: invalidate,
  });
  const assignAccountPlan = useMutation({ mutationFn: (planId: string) => services.accounts.assignAccountPlan(planId), onSuccess: invalidate });

  return {
    accountId,
    month,
    isCurrentMonth,
    setMonth: (next: string) => url.set({ month: next === currentUtcMonth() ? null : next }),
    searchDraft,
    setSearchDraft,
    setUsersPage: (page: number) => url.set({ page }),
    canManage,
    account,
    users,
    recent,
    plans: plans.data?.items ?? [],
    createUser,
    assignUserPlan,
    assignAccountPlan,
  };
}
