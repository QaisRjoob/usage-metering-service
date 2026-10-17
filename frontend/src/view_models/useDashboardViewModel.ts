import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCredentials } from '@/hooks/useCredentials';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { useServices } from '@/providers/ServicesProvider';
import { currentUtcMonth, isValidMonth } from '@/utils/dateUtils';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

export function useDashboardViewModel() {
  const { analytics } = useServices();
  const { accessToken, role } = useCredentials();
  const params = useSearchParamState();
  const monthParam = params.get('month');
  const month = isValidMonth(monthParam) ? monthParam : currentUtcMonth();

  const query = useQuery({
    queryKey: queryKeys.admin.summary(month),
    queryFn: () => analytics.getAdminSummary(month),
    enabled: Boolean(accessToken) && role === 'operator',
    staleTime: staleTimes.summary,
    placeholderData: keepPreviousData,
  });

  return {
    month,
    setMonth: (next: string) => params.set({ month: next === currentUtcMonth() ? null : next }),
    summary: query.data,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
