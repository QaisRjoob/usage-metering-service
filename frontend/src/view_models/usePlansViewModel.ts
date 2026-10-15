import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CreatePlanRequest, ListPlansParams, Plan, PlanKind, PlanScope, UpdatePlanRequest } from '@/models/plan';
import { PLAN_KINDS, PLAN_SCOPES } from '@/models/plan';
import { useCredentials } from '@/hooks/useCredentials';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { useServices } from '@/providers/ServicesProvider';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

export type PlanEditorState = { mode: 'create' } | { mode: 'edit'; plan: Plan } | null;

export function usePlansViewModel() {
  const services = useServices();
  const queryClient = useQueryClient();
  const { account } = useCredentials();
  const accountId = account?.accountId ?? '';
  const url = useSearchParamState();

  const scopeParam = url.get('scope');
  const kindParam = url.get('kind');
  const params: ListPlansParams = {
    page: url.getNumber('page', 1),
    pageSize: 20,
    scope: PLAN_SCOPES.includes(scopeParam as PlanScope) ? (scopeParam as PlanScope) : undefined,
    kind: PLAN_KINDS.includes(kindParam as PlanKind) ? (kindParam as PlanKind) : undefined,
  };

  const plans = useQuery({
    queryKey: queryKeys.account.plans(accountId, params),
    queryFn: () => services.plans.listPlans(params),
    enabled: Boolean(account),
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
    params,
    setScope: (scope: string) => url.set({ scope: scope || null }),
    setKind: (kind: string) => url.set({ kind: kind || null }),
    setPage: (page: number) => url.set({ page }),
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
