import { Link, useParams } from 'react-router';
import { ArrowLeft, Eye } from 'lucide-react';
import { routePaths } from '@/routing/routePaths';
import { formatMonthLabel, formatUtcDateTime } from '@/utils/dateUtils';
import { formatUnits } from '@/utils/numberUtils';
import { useAccountDetailsViewModel } from '@/view_models/useAccountDetailsViewModel';
import { ErrorState } from '@/widgets/common/ErrorState';
import { PageSkeleton, TableSkeleton } from '@/widgets/common/LoadingSkeleton';
import { MonthSelect } from '@/widgets/common/MonthSelect';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { RecentUsageTable } from '@/widgets/dashboard/RecentUsageTable';
import { QuotaSnapshotCard } from '@/widgets/quotas/QuotaSnapshotCard';
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
  const account = vm.account.data;

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
          <CardHeader title="Requests" description={formatMonthLabel(vm.month)} />
          <CardBody>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-emerald-50 p-3">
                <dt className="text-xs text-emerald-700">Accepted</dt>
                <dd className="text-lg font-semibold tabular-nums text-emerald-900">{formatUnits(account.requests.accepted)}</dd>
              </div>
              <div className="rounded-lg bg-rose-50 p-3">
                <dt className="text-xs text-rose-700">Rejected</dt>
                <dd className="text-lg font-semibold tabular-nums text-rose-900">{formatUnits(account.requests.rejected)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs text-slate-600">Units rejected</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatUnits(account.requests.unitsRejected)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-slate-500">
              The account&apos;s usage is the sum of accepted usage across its {account.userCount} users. A bigger user plan does not increase the shared allowance.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Users" description={`Individual quotas for ${formatMonthLabel(vm.month)}`} />
        <UserFilterBar list={vm.list} planOptions={vm.planOptions} planName={vm.planName} showMonth totalItems={vm.users.data?.totalItems} isFetching={vm.users.isFetching} />
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
              sort={{ field: vm.list.sort, order: vm.list.order }}
              onSort={vm.list.setSort}
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
            <Link to={`${routePaths.operator.usage}?accountId=${encodeURIComponent(accountId)}&month=${vm.month}`} className="text-xs font-medium text-brand-600 hover:underline">
              Full history with filters
            </Link>
          }
        />
        {vm.recent.data ? <RecentUsageTable records={vm.recent.data.items} showAccount={false} /> : vm.recent.error ? <ErrorState compact className="m-4" error={vm.recent.error} /> : <TableSkeleton rows={4} />}
      </Card>
    </>
  );
}
