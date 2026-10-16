import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { UsageRecord } from '@/models/usage-record';
import { adminListUsageQuerySchema, listUsageQuerySchema } from '@/models/usage-record';
import { useCredentials } from '@/hooks/useCredentials';
import { useListQuery } from '@/hooks/useListQuery';
import { useServices } from '@/providers/ServicesProvider';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

export type HistoryScope = 'account' | 'operator';

const COMMON_FIELDS = ['userId', 'outcome', 'rule', 'level', 'minUnits', 'maxUnits', 'requestId', 'replayed', 'month', 'from', 'to'] as const;
const OPERATOR_FIELDS = [...COMMON_FIELDS, 'accountId'] as const;

/**
 * Request history, filtered, sorted and paginated on the server. The account interface uses
 * GET /usage (the account always comes from the API key); the operator interface uses
 * GET /admin/usage with an optional account filter.
 */
export function useUsageHistoryViewModel(scope: HistoryScope) {
  const services = useServices();
  const { account } = useCredentials();
  const accountList = useListQuery(listUsageQuerySchema, COMMON_FIELDS, { pageSize: 20, sort: 'createdAt', order: 'desc' });
  const operatorList = useListQuery(adminListUsageQuerySchema, OPERATOR_FIELDS, { pageSize: 20, sort: 'createdAt', order: 'desc' });
  const list = scope === 'operator' ? operatorList : accountList;

  const history = useQuery({
    queryKey: scope === 'operator' ? queryKeys.admin.usage(operatorList.query ?? {}) : queryKeys.account.usage(account?.accountId ?? '', accountList.query ?? {}),
    queryFn: () => (scope === 'operator' ? services.usage.getAdminUsageHistory(operatorList.query!) : services.usage.getUsageHistory(accountList.query!)),
    enabled: list.isValid,
    staleTime: staleTimes.usage,
    placeholderData: keepPreviousData,
  });

  const [selected, setSelected] = useState<UsageRecord | null>(null);
  return { scope, list, history, selected, select: setSelected };
}
