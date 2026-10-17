import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Eye } from 'lucide-react';
import type { UsageRecord } from '@/models/usage-record';
import { useCredentials } from '@/hooks/useCredentials';
import { useServices } from '@/providers/ServicesProvider';
import { buildAccountDetailsPath, routePaths } from '@/routing/routePaths';
import { currentUtcMonth, formatMonthLabel, formatUtcDateTime, isValidMonth } from '@/utils/dateUtils';
import { formatUnits } from '@/utils/numberUtils';
import { queryKeys, staleTimes } from '@/utils/queryKeys';
import { DataTable, type Column } from '@/widgets/common/DataTable';
import { EmptyState } from '@/widgets/common/EmptyState';
import { ErrorState } from '@/widgets/common/ErrorState';
import { PageSkeleton, TableSkeleton } from '@/widgets/common/LoadingSkeleton';
import { MonthSelect } from '@/widgets/common/MonthSelect';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { UsageTrendChart } from '@/widgets/dashboard/UsageTrendChart';
import { LastActivityCell } from '@/widgets/directory/ActivityCells';
import { MonthlyTrendChart, RejectionChips, StatGrid, StatTile } from '@/widgets/insights/InsightWidgets';
import { QuotaSnapshotCard } from '@/widgets/quotas/QuotaSnapshotCard';
import { OutcomeBadge, RuleCell } from '@/widgets/usage/OutcomeBadge';
import { Badge } from '@/widgets/ui/Badge';
import { Card, CardBody, CardHeader } from '@/widgets/ui/Card';

const historyColumns: Column<UsageRecord>[] = [
  { key: 'time', header: 'Time (UTC)', cell: (row) => <span className="text-xs whitespace-nowrap">{formatUtcDateTime(row.createdAt)}</span> },
  { key: 'request', header: 'Request id', cell: (row) => <span className="font-mono text-xs">{row.requestId}</span>, hideBelow: 'sm' },
  { key: 'units', header: 'Units', cell: (row) => formatUnits(row.unitsRequested), align: 'right' },
  { key: 'outcome', header: 'Outcome', cell: (row) => <OutcomeBadge outcome={row.outcome} /> },
  { key: 'rule', header: 'Rule', cell: (row) => <RuleCell rule={row.rejectionRule} level={row.rejectionLevel} />, hideBelow: 'md' },
  {
    key: 'plans',
    header: 'Plan versions',
    cell: (row) => (
      <span className="text-xs whitespace-nowrap text-slate-500">
        {row.userPlan.planName} v{row.userPlan.version} · {row.accountPlan.planName} v{row.accountPlan.version}
      </span>
    ),
    hideBelow: 'lg',
  },
  { key: 'replays', header: 'Retries', cell: (row) => (row.replayCount > 0 ? `${row.replayCount}×` : '—'), align: 'right', hideBelow: 'lg' },
];

type Scope = 'operator' | 'account';

/**
 * One user - plan, both quotas, statistics, trends and request history. The operator reaches it
 * from any company (read-only); a company from its own Users page (its API key decides the account).
 */
function UserDetailsPage({ scope }: { scope: Scope }) {
  const params = useParams();
  const { account: session } = useCredentials();
  const accountId = scope === 'operator' ? (params.accountId ?? '') : (session?.accountId ?? '');
  const userId = params.userId ?? '';
  const services = useServices();
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month');
  const month = isValidMonth(monthParam) ? monthParam : currentUtcMonth();
  const page = Number(searchParams.get('page')) || 1;
  const pageSize = Number(searchParams.get('pageSize')) || 10;
  const setParams = (updates: Record<string, string | number | null>) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(updates)) {
          if (value === null) next.delete(key);
          else next.set(key, String(value));
        }
        return next;
      },
      { replace: true },
    );

  const overview = useQuery({
    queryKey: scope === 'operator' ? queryKeys.admin.userOverview(accountId, userId, month) : queryKeys.account.userOverview(accountId, userId, month),
    queryFn: () => (scope === 'operator' ? services.directory.userOverview(accountId, userId, month) : services.users.getUserOverview(userId, month)),
    staleTime: staleTimes.summary,
    placeholderData: keepPreviousData,
  });
  const historyParams = { userId, month, page, pageSize };
  const history = useQuery({
    queryKey: scope === 'operator' ? queryKeys.admin.usage({ ...historyParams, accountId }) : queryKeys.account.usage(accountId, historyParams),
    queryFn: () =>
      scope === 'operator' ? services.usage.getAdminUsageHistory({ ...historyParams, accountId }) : services.usage.getUsageHistory(historyParams),
    staleTime: staleTimes.usage,
    placeholderData: keepPreviousData,
  });

  const backLink = (
    <Link
      to={scope === 'operator' ? buildAccountDetailsPath(accountId) : routePaths.account.users}
      className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
    >
      <ArrowLeft className="size-4" aria-hidden="true" /> {scope === 'account' ? 'All users' : overview.data ? overview.data.account.name : 'Company'}
    </Link>
  );
  if (overview.error && !overview.data) {
    return (
      <>
        {backLink}
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      </>
    );
  }
  const data = overview.data;
  if (!data) return <PageSkeleton />;

  const total = data.requests.accepted + data.requests.rejected;
  const historyLink = (extra: string) =>
    scope === 'operator'
      ? `${routePaths.operator.usage}?accountId=${encodeURIComponent(accountId)}&userId=${encodeURIComponent(userId)}&month=${month}${extra}`
      : `${routePaths.account.usage}?userId=${encodeURIComponent(userId)}&month=${month}${extra}`;

  return (
    <>
      {backLink}
      <PageHeader
        title={data.user.externalUserId}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {data.user.displayName && <span className="font-medium text-slate-700">{data.user.displayName}</span>}
            {scope === 'operator' && (
              <span>
                User of{' '}
                <Link to={buildAccountDetailsPath(accountId)} className="font-medium text-brand-700 hover:underline">
                  {data.account.name}
                </Link>
              </span>
            )}
            <Badge tone={data.plan.isPredefined ? 'neutral' : 'brand'}>{data.plan.isPredefined ? `${data.plan.name} (predefined)` : `${data.plan.name} (custom)`}</Badge>
            <span className="font-mono text-xs text-slate-400">
              {data.user.id} · registered {formatUtcDateTime(data.user.createdAt)}
            </span>
          </span>
        }
        actions={<MonthSelect value={month} onChange={(value) => setParams({ month: value, page: null })} />}
      />
      <p className="mb-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <Eye className="size-4 text-slate-400" aria-hidden="true" />
        {scope === 'operator'
          ? 'Read-only operator view. A request needs both this user’s plan and the company’s shared plan to allow it.'
          : 'A request needs both this user’s plan and your shared account plan to allow it. Change the user’s plan on the Users page.'}
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <QuotaSnapshotCard quota={data.quota} title="User plan (individual)" highlight />
        <QuotaSnapshotCard quota={data.accountQuota} title={scope === 'operator' ? `${data.account.name} (shared)` : 'Your account plan (shared)'} />
        <Card>
          <CardHeader title="Statistics" description={formatMonthLabel(month)} />
          <CardBody className="space-y-4">
            <StatGrid className="sm:grid-cols-2">
              <StatTile label="Accepted" value={formatUnits(data.requests.accepted)} tone="success" />
              <StatTile label="Rejected" value={formatUnits(data.requests.rejected)} tone="danger" hint={`${formatUnits(data.requests.unitsRejected)} units refused`} />
              <StatTile label="Rejection rate" value={`${total === 0 ? 0 : Math.round((data.requests.rejected * 1000) / total) / 10}%`} />
              <StatTile label="Last request" value={<LastActivityCell lastRequestAt={data.activity.lastRequestAt} />} />
            </StatGrid>
            <div>
              <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">Why requests were rejected</p>
              <RejectionChips items={data.rejectionsByRule} linkFor={(item) => historyLink(`&outcome=rejected&rule=${item.rule}&level=${item.level}`)} />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Daily usage" description={`Units consumed and rejected requests per day · ${formatMonthLabel(month)} (UTC)`} />
          <CardBody>
            <UsageTrendChart data={data.daily} />
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Last six months" description="This user only" />
          <CardBody>
            <MonthlyTrendChart data={data.monthly} height={280} />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Request history"
          description={`Every request of ${data.user.externalUserId} in ${formatMonthLabel(month)}, newest first`}
          actions={
            <Link to={historyLink('')} className="text-xs font-medium text-brand-600 hover:underline">
              Open in usage history (more filters)
            </Link>
          }
        />
        {history.error && !history.data ? (
          <ErrorState compact className="m-4" error={history.error} onRetry={() => void history.refetch()} />
        ) : history.data ? (
          <>
            <DataTable
              caption={`Requests of ${data.user.externalUserId}`}
              columns={historyColumns}
              rows={history.data.items}
              getRowKey={(row) => row.id}
              isLoading={history.isFetching}
              empty={<EmptyState title="No requests in this month" description="Pick another month above." />}
            />
            <PaginationControls {...history.data} onPageChange={(next) => setParams({ page: next })} onPageSizeChange={(next) => setParams({ pageSize: next, page: null })} isFetching={history.isFetching} />
          </>
        ) : (
          <TableSkeleton rows={4} />
        )}
      </Card>
    </>
  );
}

export function OperatorUserDetailsView() {
  return <UserDetailsPage scope="operator" />;
}

export function AccountUserDetailsView() {
  return <UserDetailsPage scope="account" />;
}
