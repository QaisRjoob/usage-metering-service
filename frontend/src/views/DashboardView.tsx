import { Link } from 'react-router';
import { routePaths } from '@/routing/routePaths';
import { formatMonthLabel } from '@/utils/dateUtils';
import { useDashboardViewModel } from '@/view_models/useDashboardViewModel';
import { CredentialsGate } from '@/widgets/common/CredentialsGate';
import { ErrorState } from '@/widgets/common/ErrorState';
import { CardsSkeleton, ChartSkeleton, TableSkeleton } from '@/widgets/common/LoadingSkeleton';
import { MonthSelect } from '@/widgets/common/MonthSelect';
import { PageHeader } from '@/widgets/common/PageHeader';
import { QuotaUtilizationChart } from '@/widgets/dashboard/QuotaUtilizationChart';
import { RecentUsageTable } from '@/widgets/dashboard/RecentUsageTable';
import { UsageSummaryCards } from '@/widgets/dashboard/UsageSummaryCards';
import { UsageTrendChart } from '@/widgets/dashboard/UsageTrendChart';
import { Card, CardBody, CardHeader } from '@/widgets/ui/Card';

function DashboardContent() {
  const vm = useDashboardViewModel();
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Usage across all accounts for one UTC month. Allocated units are the sum of account plans' monthly allowances."
        actions={<MonthSelect value={vm.month} onChange={vm.setMonth} />}
      />
      {vm.error && !vm.summary ? (
        <ErrorState error={vm.error} onRetry={vm.refetch} />
      ) : (
        <div className="space-y-6">
          {vm.summary ? <UsageSummaryCards summary={vm.summary} /> : <CardsSkeleton />}
          <div className="grid gap-6 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader title="Usage trend" description={`Daily units consumed and rejected requests · ${formatMonthLabel(vm.month)} (UTC)`} />
              <CardBody>{vm.summary ? <UsageTrendChart data={vm.summary.daily} /> : <ChartSkeleton />}</CardBody>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader
                title="Quota utilization"
                description={`Most-utilized accounts · dashed lines at ${vm.summary?.thresholdPercent ?? 80}% and 100%`}
              />
              <CardBody>
                {vm.summary ? <QuotaUtilizationChart accounts={vm.summary.topAccounts} thresholdPercent={vm.summary.thresholdPercent} /> : <ChartSkeleton />}
              </CardBody>
            </Card>
          </div>
          <Card>
            <CardHeader
              title="Recent activity"
              description="Latest accepted and rejected decisions across accounts"
              actions={
                <Link to={routePaths.usage} className="text-xs font-medium text-brand-600 hover:underline">
                  View full history
                </Link>
              }
            />
            {vm.summary ? <RecentUsageTable records={vm.summary.recentActivity} /> : <TableSkeleton />}
          </Card>
          {vm.summary && (
            <Card>
              <CardHeader title="Monthly totals" description="Selected month and the five before it" />
              <CardBody>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {vm.summary.monthly.map((point) => (
                    <li key={point.period} className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">{formatMonthLabel(point.period)}</p>
                      <p className="text-sm font-semibold tabular-nums">{point.unitsConsumed.toLocaleString('en-US')} units</p>
                      <p className="text-xs text-slate-500">{point.rejectedRequests} rejected</p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

export default function DashboardView() {
  return (
    <CredentialsGate scope="admin">
      <DashboardContent />
    </CredentialsGate>
  );
}
