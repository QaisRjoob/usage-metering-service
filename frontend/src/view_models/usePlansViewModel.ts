import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CreatePlanRequest, Plan, UpdatePlanRequest } from '@/models/plan';
import { listPlansQuerySchema } from '@/models/plan';
import { useCredentials } from '@/hooks/useCredentials';
import { useListQuery } from '@/hooks/useListQuery';
import { useServices } from '@/providers/ServicesProvider';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

export const PLAN_FILTER_FIELDS = ['search', 'scope', 'kind'] as const;

export type PlanEditorState = { mode: 'create' } | { mode: 'edit'; plan: Plan } | null;

export function usePlansViewModel() {
  const services = useServices();
  const queryClient = useQueryClient();
  const { account } = useCredentials();
  const accountId = account?.accountId ?? '';
  const list = useListQuery(listPlansQuerySchema, PLAN_FILTER_FIELDS, { pageSize: 20, order: 'asc' });

  const plans = useQuery({
    queryKey: queryKeys.account.plans(accountId, list.query ?? {}),
    queryFn: () => services.plans.listPlans(list.query!),
    enabled: Boolean(account) && list.isValid,
    staleTime: staleTimes.plans,
    placeholderData: keepPreviousData,
  });

  // The connected account's own state, used to warn when a reduction goes below current usage.
  const current = useQuery({
    queryKey: queryKeys.account.current(accountId),
    queryFn: () => services.accounts.getCurrentAccount(),
    enabled: Boolean(account),
    staleTime: staleTimes.quota,
  });

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const details = useQuery({
    queryKey: queryKeys.account.plan(accountId, selectedPlanId ?? ''),
    queryFn: () => services.plans.getPlan(selectedPlanId!),
    enabled: Boolean(account && selectedPlanId),
    staleTime: staleTimes.quota,
  });

  const [editor, setEditor] = useState<PlanEditorState>(null);

  // A plan change affects quotas, usage summaries and the plan list: refresh the whole account scope.
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.account.all(accountId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
  };

  const createPlan = useMutation({
    mutationFn: (request: CreatePlanRequest) => services.plans.createPlan(request),
    onSuccess: () => {
      invalidate();
      setEditor(null);
    },
  });

  const updatePlan = useMutation({
    mutationFn: ({ planId, request }: { planId: string; request: UpdatePlanRequest }) => services.plans.updatePlan(planId, request),
    onSuccess: () => {
      invalidate();
      setEditor(null);
    },
  });

  return {
    list,
    plans,
    accountQuota: current.data?.quota ?? null,
    selectedPlanId,
    openDetails: setSelectedPlanId,
    closeDetails: () => setSelectedPlanId(null),
    details,
    editor,
    openCreate: () => setEditor({ mode: 'create' }),
    openEdit: (plan: Plan) => setEditor({ mode: 'edit', plan }),
    closeEditor: () => {
      setEditor(null);
      createPlan.reset();
      updatePlan.reset();
    },
    createPlan,
    updatePlan,
  };
}
