import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Eye } from 'lucide-react';
import { buildOperatorUserPath, routePaths } from '@/routing/routePaths';
import { formatMonthLabel, formatUtcDateTime } from '@/utils/dateUtils';
import { formatUnits } from '@/utils/numberUtils';
import { useAccountDetailsViewModel } from '@/view_models/useAccountDetailsViewModel';
import { ErrorState } from '@/widgets/common/ErrorState';
import { ChartSkeleton, PageSkeleton, TableSkeleton } from '@/widgets/common/LoadingSkeleton';
import { MonthSelect } from '@/widgets/common/MonthSelect';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { RecentUsageTable } from '@/widgets/dashboard/RecentUsageTable';
import { UsageTrendChart } from '@/widgets/dashboard/UsageTrendChart';
import { LastActivityCell } from '@/widgets/directory/ActivityCells';
import { MonthlyTrendChart, RejectionChips, StatGrid, StatTile } from '@/widgets/insights/InsightWidgets';
import { QuotaSnapshotCard } from '@/widgets/quotas/QuotaSnapshotCard';
import { UserCategoryPanel } from '@/widgets/users/UserCategoryPanel';
import { UserFilterBar } from '@/widgets/users/UserFilterBar';
import { UsersTable } from '@/widgets/users/UsersTable';
import { Button } from '@/widgets/ui/Button';
import { Card, CardBody, CardHeader } from '@/widgets/ui/Card';

function BackLink() {
  return (
    <Link to={routePaths.operator.accounts} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <ArrowLeft className="size-4" aria-hidden="true" /> All accounts
    </Link>
  );
}

/** Operator: one account, read-only. The company manages its users and plans in its own portal. */
export default function AccountDetailsView() {
  const { accountId = '' } = useParams();
  const vm = useAccountDetailsViewModel(accountId);
  const navigate = useNavigate();
  const account = vm.account.data;
  const summary = vm.summary.data;
  const historyLink = (extra: string) => `${routePaths.operator.usage}?accountId=${encodeURIComponent(accountId)}&month=${vm.month}${extra}`;

  if (vm.account.error && !account) {
    return (
      <>
        <BackLink />
        <ErrorState error={vm.account.error} onRetry={() => void vm.account.refetch()} />
      </>
    );
  }
  if (!account) return <PageSkeleton />;

  return (
    <>
      <BackLink />
      <PageHeader
        title={account.name}
        description={
          <span className="font-mono text-xs">
            {account.id} · key {account.apiKeyPrefix}… · created {formatUtcDateTime(account.createdAt)}
          </span>
        }
        actions={<MonthSelect value={vm.month} onChange={(month) => vm.list.set({ month })} />}
      />
      <p className="mb-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <Eye className="size-4 text-slate-400" aria-hidden="true" />
        Read-only operator view. The company registers users and changes plans in its own account portal.
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <QuotaSnapshotCard quota={account.quota} title="Account plan (shared by all users)" />
        <Card className="lg:col-span-2">
          <CardHeader title="Company statistics" description={formatMonthLabel(vm.month)} />
          <CardBody className="space-y-4">
            <StatGrid>
              <StatTile label="Accepted requests" value={formatUnits(account.requests.accepted)} tone="success" />
              <StatTile label="Rejected requests" value={formatUnits(account.requests.rejected)} tone="danger" hint={`${formatUnits(account.requests.unitsRejected)} units refused`} />
              <StatTile
                label="Rejection rate"
                value={`${account.requests.accepted + account.requests.rejected === 0 ? 0 : Math.round((account.requests.rejected * 1000) / (account.requests.accepted + account.requests.rejected)) / 10}%`}
              />
              <StatTile label="Users" value={formatUnits(account.userCount)} hint={summary ? `${summary.users.approachingLimit} approaching · ${summary.users.atOrOverLimit} at or over limit` : undefined} />
              <StatTile label="Units left (shared)" value={formatUnits(account.quota.remaining)} tone="brand" hint={`of ${formatUnits(account.quota.monthlyAllowance)}`} />
              <StatTile label="Last request" value={<LastActivityCell lastRequestAt={account.activity.lastRequestAt} />} />
            </StatGrid>
            <div>
              <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">Why requests were rejected</p>
              {summary ? <RejectionChips items={summary.rejectionsByRule} linkFor={(item) => historyLink(`&outcome=rejected&rule=${item.rule}&level=${item.level}`)} /> : <p className="text-xs text-slate-400">Loading…</p>}
            </div>
            <p className="text-xs text-slate-500">
              The account&apos;s usage is the sum of accepted usage across its {account.userCount} users. A bigger user plan does not increase the shared allowance.
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Daily usage" description={`Units consumed and rejected requests per day · ${formatMonthLabel(vm.month)} (UTC)`} />
          <CardBody>{summary ? <UsageTrendChart data={summary.daily} /> : <ChartSkeleton />}</CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Last six months" description="This company only" />
          <CardBody>{summary ? <MonthlyTrendChart data={summary.monthly} height={280} /> : <ChartSkeleton />}</CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Users" description={`Individual quotas for ${formatMonthLabel(vm.month)} · click a user for their statistics and activity`} />
        <UserCategoryPanel facets={vm.userFacets.data} filters={vm.list.filters} set={vm.list.set} />
        <UserFilterBar list={vm.list} planOptions={vm.planOptions} planName={vm.planName} showMonth categories totalItems={vm.users.data?.totalItems} isFetching={vm.users.isFetching} />
        {!vm.list.isValid ? (
          <p role="alert" className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Fix the highlighted filter to see results.
          </p>
        ) : vm.users.error && !vm.users.data ? (
          <ErrorState className="m-4" error={vm.users.error} onRetry={() => void vm.users.refetch()} />
        ) : (
          <>
            <UsersTable
              users={vm.users.data?.items}
              isLoading={vm.users.isPending || vm.users.isFetching}
              showActivity
              sort={{ field: vm.list.sort, order: vm.list.order }}
              onSort={vm.list.setSort}
              onOpenUser={(user) => navigate(`${buildOperatorUserPath(accountId, user.externalUserId)}?month=${vm.month}`)}
              emptyHint={vm.list.activeCount > 0 ? 'No users match these filters.' : 'This account has not registered any users yet.'}
              emptyAction={
                vm.list.activeCount > 0 ? (
                  <Button variant="outline" size="sm" onClick={vm.list.clearAll}>
                    Clear all filters
                  </Button>
                ) : undefined
              }
            />
            {vm.users.data && <PaginationControls {...vm.users.data} onPageChange={vm.list.setPage} onPageSizeChange={vm.list.setPageSize} isFetching={vm.users.isFetching} />}
          </>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Recent requests"
          description={formatMonthLabel(vm.month)}
          actions={
            <Link to={historyLink('')} className="text-xs font-medium text-brand-600 hover:underline">
              Full history with filters
            </Link>
          }
        />
        {vm.recent.data ? <RecentUsageTable records={vm.recent.data.items} showAccount={false} /> : vm.recent.error ? <ErrorState compact className="m-4" error={vm.recent.error} /> : <TableSkeleton rows={4} />}
      </Card>
    </>
  );
}
