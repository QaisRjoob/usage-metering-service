import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ConsumeDecision, ConsumeRequest } from '@/models/consumption';
import { DOCUMENT_TYPES } from '@/models/consumption';
import type { UpdatePlanRequest } from '@/models/plan';
import { useCredentials } from '@/hooks/useCredentials';
import { useServices } from '@/providers/ServicesProvider';
import { generateRequestId } from '@/utils/formatUtils';
import { queryKeys, staleTimes } from '@/utils/queryKeys';

export interface DemoLogEntry {
  id: string;
  request: ConsumeRequest;
  decision: ConsumeDecision;
}

export interface ScenarioStep {
  id: 'accepted' | 'userLimit' | 'accountLimit' | 'planChange' | 'replay';
  title: string;
  hint: string;
  preset?: { userId: string; units: number };
  done: boolean;
}

/** Was a request that failed earlier accepted later, under a different plan version? */
function outcomeChangedAfterPlanChange(log: DemoLogEntry[]): boolean {
  const fresh = log.filter((entry) => !entry.decision.idempotentReplay);
  return fresh.some((later, laterIndex) =>
    fresh.slice(0, laterIndex).some(
      (earlier) =>
        !earlier.decision.accepted &&
        later.decision.accepted &&
        earlier.request.userId === later.request.userId &&
        earlier.request.units === later.request.units &&
        (earlier.decision.account.planVersionId !== later.decision.account.planVersionId || earlier.decision.user.planVersionId !== later.decision.user.planVersionId),
    ),
  );
}

/**
 * The Client Demo plays the role of an external "document processor" application. It talks to the
 * service only through account-scoped endpoints with the account's API key - never admin endpoints.
 */
export function useClientDemoViewModel() {
  const services = useServices();
  const queryClient = useQueryClient();
  const { account } = useCredentials();
  const accountId = account?.accountId ?? '';

  const usersParams = { page: 1, pageSize: 100 };
  const users = useQuery({
    queryKey: queryKeys.account.users(accountId, usersParams),
    queryFn: () => services.users.listUsers(usersParams),
    enabled: Boolean(account),
    staleTime: staleTimes.quota,
  });

  const [userId, setUserId] = useState('');
  const [units, setUnits] = useState(String(DOCUMENT_TYPES[1]?.units ?? 10));
  const [lastRequest, setLastRequest] = useState<ConsumeRequest | null>(null);
  const [log, setLog] = useState<DemoLogEntry[]>([]);
  const effectiveUserId = userId || users.data?.items[0]?.externalUserId || '';

  const refreshAccountData = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.account.all(accountId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
  };

  const consume = useMutation({
    mutationFn: (request: ConsumeRequest) => services.usage.consume(request),
    onSuccess: (decision, request) => {
      setLog((previous) => [...previous, { id: `${decision.usageRecordId}-${previous.length}`, request, decision }]);
      refreshAccountData();
    },
  });

  const send = (request: ConsumeRequest) => {
    setLastRequest(request);
    consume.mutate(request);
  };

  /** Each new action gets a fresh request id. */
  const processDocument = (override?: { userId: string; units: number }) => {
    const request: ConsumeRequest = {
      userId: override?.userId ?? effectiveUserId,
      units: override?.units ?? Number(units),
      requestId: generateRequestId('doc'),
    };
    if (override) {
      setUserId(override.userId);
      setUnits(String(override.units));
    }
    send(request);
  };

  /** Re-sends the exact same request id: the service must replay, not consume again. */
  const retrySameRequest = () => {
    if (lastRequest) send(lastRequest);
  };

  // --- Operator side panel: change plans while the client code stays the same ----------------
  const plansParams = { page: 1, pageSize: 100 };
  const plans = useQuery({
    queryKey: queryKeys.account.plans(accountId, plansParams),
    queryFn: () => services.plans.listPlans(plansParams),
    enabled: Boolean(account),
    staleTime: staleTimes.plans,
  });
  const current = useQuery({
    queryKey: queryKeys.account.current(accountId),
    queryFn: () => services.accounts.getCurrentAccount(),
    enabled: Boolean(account),
    staleTime: staleTimes.quota,
  });
  const assignUserPlan = useMutation({
    mutationFn: ({ userId: target, planId }: { userId: string; planId: string }) => services.users.assignUserPlan(target, planId),
    onSuccess: refreshAccountData,
  });
  const updatePlan = useMutation({
    mutationFn: ({ planId, request }: { planId: string; request: UpdatePlanRequest }) => services.plans.updatePlan(planId, request),
    onSuccess: refreshAccountData,
  });

  const steps: ScenarioStep[] = useMemo(() => {
    const fresh = log.filter((entry) => !entry.decision.idempotentReplay);
    return [
      {
        id: 'accepted',
        title: 'Accepted action',
        hint: 'alice processes an invoice (10 units). Both plans allow it; 10 units are added at both levels.',
        preset: { userId: 'alice', units: 10 },
        done: fresh.some((entry) => entry.decision.accepted),
      },
      {
        id: 'userLimit',
        title: 'Rejected by a user limit',
        hint: 'alice processes a contract (25 units). Her Basic plan allows at most 20 per request.',
        preset: { userId: 'alice', units: 25 },
        done: fresh.some((entry) => entry.decision.rejection?.level === 'user'),
      },
      {
        id: 'accountLimit',
        title: 'Rejected by the shared account limit',
        hint: 'bob (Premium, plenty left) processes an annual report (95 units), but the shared account pool has fewer units left.',
        preset: { userId: 'bob', units: 95 },
        done: fresh.some((entry) => entry.decision.rejection?.level === 'account'),
      },
      {
        id: 'planChange',
        title: 'Change a plan, repeat the same action',
        hint: 'Use the plan panel (switch alice to Premium, or raise the shared pool), then repeat step 2 or 3. Same client code, different outcome.',
        done: outcomeChangedAfterPlanChange(log),
      },
      {
        id: 'replay',
        title: 'Retry the same request',
        hint: 'Press "Retry same request". The stored decision is replayed and nothing is consumed twice.',
        done: log.some((entry) => entry.decision.idempotentReplay),
      },
    ];
  }, [log]);

  return {
    account,
    users,
    userId: effectiveUserId,
    setUserId,
    units,
    setUnits,
    processDocument,
    retrySameRequest,
    lastRequest,
    consume,
    latest: log[log.length - 1] ?? null,
    log: [...log].reverse(),
    clearLog: () => setLog([]),
    steps,
    plans: plans.data?.items ?? [],
    currentAccount: current.data ?? null,
    assignUserPlan,
    updatePlan,
  };
}
