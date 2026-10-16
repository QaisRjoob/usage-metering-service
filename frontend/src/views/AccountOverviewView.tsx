import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCredentials } from '@/hooks/useCredentials';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { LEVEL_LABELS, RULE_LABELS } from '@/models/quota';
import { useServices } from '@/providers/ServicesProvider';
import { routePaths } from '@/routing/routePaths';
import { currentUtcMonth, formatMonthLabel, isValidMonth } from '@/utils/dateUtils';
import { formatUnits } from '@/utils/numberUtils';
import { queryKeys, staleTimes } from '@/utils/queryKeys';
import { ErrorState } from '@/widgets/common/ErrorState';
import { ChartSkeleton, PageSkeleton } from '@/widgets/common/LoadingSkeleton';
import { MonthSelect } from '@/widgets/common/MonthSelect';
import { PageHeader } from '@/widgets/common/PageHeader';
import { UsageTrendChart } from '@/widgets/dashboard/UsageTrendChart';
import { QuotaSnapshotCard } from '@/widgets/quotas/QuotaSnapshotCard';
import { AssignPlanDialog } from '@/widgets/users/AssignPlanDialog';
import { UsersTable } from '@/widgets/users/UsersTable';
import { Button } from '@/widgets/ui/Button';
import { Card, CardBody, CardHeader } from '@/widgets/ui/Card';

/** Account portal home: the company's shared quota, activity and the users closest to their limits. */
export default function AccountOverviewView() {
  const services = useServices();
  const queryClient = useQueryClient();
  const { account } = useCredentials();
  const accountId = account?.accountId ?? '';
  const url = useSearchParamState();
  const monthParam = url.get('month');
  const month = isValidMonth(monthParam) ? monthParam : currentUtcMonth();
  const isCurrentMonth = month === currentUtcMonth();
  const [planDialogOpen, setPlanDialogOpen] = useState(false);

  const summary = useQuery({
    queryKey: queryKeys.account.usageSummary(accountId, month),
    queryFn: () => services.usage.getUsageSummary(month),
    staleTime: staleTimes.summary,
    placeholderData: keepPreviousData,
  });
  const plansParams = { scope: 'account' as const, page: 1, pageSize: 100 };
  const accountPlans = useQuery({
    queryKey: queryKeys.account.plans(accountId, plansParams),
    queryFn: () => services.plans.listPlans(plansParams),
    staleTime: staleTimes.plans,
    enabled: planDialogOpen,
  });
  const assignPlan = useMutation({
    mutationFn: (planId: string) => services.accounts.assignAccountPlan(planId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.account.all(accountId) }),
  });

  const data = summary.data;
  if (summary.error && !data) return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  if (!data) return <PageSkeleton />;

  return (
    <>
      <PageHeader
        title={`Welcome, ${account?.accountName ?? 'your account'}`}
        description="Your shared account quota, this month's activity and the users closest to their individual limits. All times are UTC."
        actions={<MonthSelect value={month} onChange={(next) => url.set({ month: next === currentUtcMonth() ? null : next })} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3">
          <QuotaSnapshotCard quota={data.account} title="Account plan (shared by all users)" />
          {isCurrentMonth && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setPlanDialogOpen(true)}>
              Change account plan
            </Button>
          )}
        </div>
        <Card className="lg:col-span-2">
          <CardHeader title="Activity" description={formatMonthLabel(month)} />
          <CardBody className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
              <Stat label="Accepted" value={data.requests.accepted} tone="emerald" />
              <Stat label="Rejected" value={data.requests.rejected} tone="rose" />
              <Stat label="Users" value={data.users.total} />
              <Stat label="Users ≥ 80 %" value={data.users.approachingLimit + data.users.atOrOverLimit} tone="amber" />
            </dl>
            {data.rejectionsByRule.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Why requests were rejected</p>
                <ul className="flex flex-wrap gap-2">
                  {data.rejectionsByRule.map((item) => (
                    <li key={`${item.rule}-${item.level}`}>
                      <Link
                        to={`${routePaths.account.usage}?outcome=rejected&rule=${item.rule}&level=${item.level}&month=${month}`}
                        className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-800 ring-1 ring-inset ring-rose-200 hover:bg-rose-100"
                      >
                        {RULE_LABELS[item.rule]} · {LEVEL_LABELS[item.level]}: <strong>{item.count}</strong>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Daily usage" description={`Units consumed and rejected requests per day · ${formatMonthLabel(month)}`} />
        <CardBody>{summary.isFetching && !data ? <ChartSkeleton /> : <UsageTrendChart data={data.daily} />}</CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Users closest to their limits"
          description="Highest individual utilization this month"
          actions={
            <Link to={`${routePaths.account.users}?sort=utilization&order=desc`} className="text-xs font-medium text-brand-600 hover:underline">
              All users
            </Link>
          }
        />
        <UsersTable users={data.topUsers} isLoading={false} emptyHint="Register users to see them here." />
      </Card>

      {planDialogOpen && (
        <AssignPlanDialog
          open
          onClose={() => {
            setPlanDialogOpen(false);
            assignPlan.reset();
          }}
          subjectLabel="your account"
          scope="account"
          plans={accountPlans.data?.items ?? []}
          current={data.account}
          submitting={assignPlan.isPending}
          error={assignPlan.error}
          onAssign={(planId) => assignPlan.mutate(planId, { onSuccess: () => setPlanDialogOpen(false) })}
        />
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'emerald' | 'rose' | 'amber' }) {
  const toneClass = tone === 'emerald' ? 'bg-emerald-50 text-emerald-900' : tone === 'rose' ? 'bg-rose-50 text-rose-900' : tone === 'amber' ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-900';
  return (
    <div className={`rounded-lg p-3 ${toneClass}`}>
      <dt className="text-xs opacity-80">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{formatUnits(value)}</dd>
    </div>
  );
}
