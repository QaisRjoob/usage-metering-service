import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { companyStatsQuerySchema, type CompanyStatsRow } from '@/models/directory';
import { QUOTA_STATUSES, STATUS_LABELS, type QuotaStatus } from '@/models/quota';
import { useListQuery } from '@/hooks/useListQuery';
import { useServices } from '@/providers/ServicesProvider';
import { buildAccountDetailsPath } from '@/routing/routePaths';
import { currentUtcMonth, formatMonthLabel } from '@/utils/dateUtils';
import { shortId } from '@/utils/formatUtils';
import { formatPercent, formatUnits } from '@/utils/numberUtils';
import { queryKeys, staleTimes } from '@/utils/queryKeys';
import { DataTable, type Column } from '@/widgets/common/DataTable';
import { EmptyState } from '@/widgets/common/EmptyState';
import { ErrorState } from '@/widgets/common/ErrorState';
import { CardsSkeleton, ChartSkeleton } from '@/widgets/common/LoadingSkeleton';
import { MonthSelect } from '@/widgets/common/MonthSelect';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { LastActivityCell } from '@/widgets/directory/ActivityCells';
import { buildChips } from '@/widgets/filters/chips';
import { FilterBar } from '@/widgets/filters/FilterBar';
import { SegmentedFilter, SelectFilter } from '@/widgets/filters/FilterFields';
import { StatGrid, StatTile } from '@/widgets/insights/InsightWidgets';
import { QuotaProgressBar } from '@/widgets/quotas/QuotaProgressBar';
import { QuotaStatusBadge } from '@/widgets/quotas/QuotaStatusBadge';
import { Button } from '@/widgets/ui/Button';
import { Card, CardBody, CardHeader } from '@/widgets/ui/Card';
import { useChartTheme } from '@/providers/themeContext';

const FIELDS = ['search', 'status', 'planId', 'activity', 'month'] as const;

const columns: Column<CompanyStatsRow>[] = [
  {
    key: 'name',
    header: 'Company',
    sortKey: 'name',
    firstOrder: 'asc',
    cell: (row) => (
      <div className="min-w-0">
        <Link to={buildAccountDetailsPath(row.account.id)} className="font-medium text-slate-900 hover:text-brand-700 hover:underline" onClick={(event) => event.stopPropagation()}>
          {row.account.name}
        </Link>
        <p className="text-[11px] text-slate-400">
          {row.quota.planName}
          {row.isCustomPlan ? ' (custom)' : ''} · {shortId(row.account.id)}
        </p>
      </div>
    ),
  },
  {
    key: 'users',
    header: 'Active / users',
    sortKey: 'activeUsers',
    cell: (row) => (
      <span className="text-xs whitespace-nowrap tabular-nums">
        {formatUnits(row.activeUsers)} / {formatUnits(row.users)}
      </span>
    ),
    align: 'right',
    hideBelow: 'md',
  },
  {
    key: 'consumed',
    header: 'Units used',
    sortKey: 'consumed',
    cell: (row) => (
      <div className="text-xs whitespace-nowrap tabular-nums">
        <p>
          {formatUnits(row.quota.consumed)} / {formatUnits(row.quota.monthlyAllowance)}
        </p>
        <p className="text-[11px] text-slate-400">{formatPercent(row.shareOfUsagePercent)} of all usage</p>
      </div>
    ),
  },
  {
    key: 'utilization',
    header: 'Utilization',
    sortKey: 'utilization',
    cell: (row) => <QuotaProgressBar className="min-w-32" utilizationPercent={row.quota.utilizationPercent} status={row.quota.status} label={`${row.account.name} utilization`} />,
    hideBelow: 'sm',
  },
  { key: 'accepted', header: 'Accepted', sortKey: 'accepted', cell: (row) => <span className="text-emerald-700 tabular-nums">{formatUnits(row.requests.accepted)}</span>, align: 'right', hideBelow: 'md' },
  {
    key: 'rejected',
    header: 'Rejected',
    sortKey: 'rejected',
    cell: (row) => <span className={row.requests.rejected > 0 ? 'font-medium text-rose-700 tabular-nums' : 'text-slate-400 tabular-nums'}>{formatUnits(row.requests.rejected)}</span>,
    align: 'right',
    hideBelow: 'md',
  },
  { key: 'rate', header: 'Rejection rate', sortKey: 'rejectionRate', cell: (row) => <span className="tabular-nums">{formatPercent(row.rejectionRatePercent)}</span>, align: 'right', hideBelow: 'lg' },
  { key: 'status', header: 'Status', cell: (row) => <QuotaStatusBadge status={row.quota.status} />, hideBelow: 'lg' },
  { key: 'last', header: 'Last request', sortKey: 'lastActivity', cell: (row) => <LastActivityCell lastRequestAt={row.lastRequestAt} />, hideBelow: 'lg' },
];

/** Share of the month's usage of the busiest companies (top 10). */
function UsageShareChart({ rows }: { rows: CompanyStatsRow[] }) {
  const chart = useChartTheme();
  const data = rows.filter((row) => row.quota.consumed > 0).map((row) => ({ name: row.account.name, share: row.shareOfUsagePercent, units: row.quota.consumed }));
  if (data.length === 0) return <EmptyState title="No usage in this month" />;
  return (
    <div style={{ height: Math.max(160, data.length * 30) }} role="img" aria-label="Share of usage per company">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} tick={{ fontSize: 11, fill: chart.axis }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: chart.label }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(_value, _name, item) => {
              const payload = item.payload as { share: number; units: number };
              return [`${formatPercent(payload.share)} (${formatUnits(payload.units)} units)`, 'Share of usage'];
            }}
            contentStyle={chart.tooltip}
          />
          <Bar dataKey="share" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Operator: statistics of every company for one month, sortable and filterable on the server. */
export default function CompanyStatsView() {
  const services = useServices();
  const navigate = useNavigate();
  const list = useListQuery(companyStatsQuerySchema, FIELDS, { pageSize: 20, sort: 'consumed', order: 'desc' });
  const f = list.filters;
  const month = f.month ?? currentUtcMonth();

  const stats = useQuery({
    queryKey: queryKeys.admin.companyStats(list.query ?? {}),
    queryFn: () => services.directory.companyStats(list.query!),
    enabled: list.isValid,
    staleTime: staleTimes.summary,
    placeholderData: keepPreviousData,
  });
  const topParams = { month, page: 1, pageSize: 10, sort: 'consumed' as const, order: 'desc' as const };
  const top = useQuery({
    queryKey: queryKeys.admin.companyStats(topParams),
    queryFn: () => services.directory.companyStats(topParams),
    staleTime: staleTimes.summary,
  });
  const planParams = { scope: 'account' as const, page: 1, pageSize: 100, sort: 'name' as const, order: 'asc' as const };
  const plans = useQuery({ queryKey: queryKeys.admin.plans(planParams), queryFn: () => services.plans.listAllPlans(planParams), staleTime: staleTimes.plans });
  const planOptions = (plans.data?.items ?? []).map((plan) => ({ value: plan.id, label: plan.isPredefined ? plan.name : `${plan.name} — ${plan.ownerAccountName ?? 'custom'}` }));

  const totals = stats.data?.totals;
  const requests = totals ? totals.acceptedRequests + totals.rejectedRequests : 0;
  const chips = buildChips(
    f,
    [
      { key: 'search', label: 'Search' },
      { key: 'status', label: 'Status', format: (value) => STATUS_LABELS[value as QuotaStatus] ?? value },
      { key: 'activity', label: 'Activity' },
      { key: 'planId', label: 'Plan', format: (value) => planOptions.find((option) => option.value === value)?.label ?? 'selected plan' },
    ],
    list.set,
  );

  return (
    <>
      <PageHeader
        title="Company statistics"
        description="How every company in the service uses its quota in one UTC month: units, share of all usage, requests, rejection rate and active users. Totals follow the filters."
        actions={<MonthSelect value={month} onChange={(value) => list.set({ month: value === currentUtcMonth() ? null : value })} />}
      />

      {totals ? (
        <Card className="mb-6">
          <CardBody>
            <StatGrid className="lg:grid-cols-6">
              <StatTile label="Companies" value={formatUnits(totals.companies)} hint={`${formatUnits(totals.activeCompanies)} with requests`} tone="brand" />
              <StatTile label="Users" value={formatUnits(totals.users)} hint={`${formatUnits(totals.activeUsers)} active`} />
              <StatTile label="Units consumed" value={formatUnits(totals.unitsConsumed)} hint={`of ${formatUnits(totals.totalAllowance)} allocated`} />
              <StatTile label="Accepted requests" value={formatUnits(totals.acceptedRequests)} tone="success" />
              <StatTile label="Rejected requests" value={formatUnits(totals.rejectedRequests)} tone="danger" hint={`${formatUnits(totals.unitsRejected)} units refused`} />
              <StatTile label="Rejection rate" value={formatPercent(requests === 0 ? 0 : Math.round((totals.rejectedRequests * 1000) / requests) / 10)} tone="warning" />
            </StatGrid>
          </CardBody>
        </Card>
      ) : (
        <div className="mb-6">
          <CardsSkeleton />
        </div>
      )}

      <Card className="mb-6">
        <CardHeader title="Share of usage" description={`Busiest companies · ${formatMonthLabel(month)}`} />
        <CardBody>{top.data ? <UsageShareChart rows={top.data.items} /> : <ChartSkeleton />}</CardBody>
      </Card>

      <Card>
        <FilterBar
          search={{ value: f.search ?? '', onChange: (value) => list.set({ search: value }), placeholder: 'Company name, account id or key prefix', label: 'Search companies' }}
          quick={
            <SegmentedFilter
              label="Activity"
              value={(f.activity as 'active' | 'inactive' | undefined) ?? ''}
              onChange={(value) => list.set({ activity: value })}
              options={[
                { value: '', label: 'All' },
                { value: 'active', label: 'With requests' },
                { value: 'inactive', label: 'No requests' },
              ]}
            />
          }
          advancedActiveCount={['status', 'planId'].filter((key) => f[key]).length}
          advanced={
            <>
              <SelectFilter label="Quota status" value={f.status ?? ''} onChange={(value) => list.set({ status: value })} options={QUOTA_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] }))} allLabel="Any status" />
              <SelectFilter label="Plan" value={f.planId ?? ''} onChange={(value) => list.set({ planId: value })} options={planOptions} allLabel="Any plan" />
            </>
          }
          chips={chips}
          onClearAll={list.clearAll}
          totalItems={stats.data?.totalItems}
          isFetching={stats.isFetching}
        />
        {stats.error && !stats.data ? (
          <ErrorState className="m-4" error={stats.error} onRetry={() => void stats.refetch()} />
        ) : (
          <>
            <DataTable
              caption="Statistics per company"
              columns={columns}
              rows={stats.data?.items}
              getRowKey={(row) => row.account.id}
              isLoading={stats.isPending || stats.isFetching}
              onRowClick={(row) => navigate(buildAccountDetailsPath(row.account.id))}
              sort={{ field: list.sort, order: list.order }}
              onSort={list.setSort}
              empty={
                <EmptyState
                  title="No companies match these filters"
                  action={
                    list.activeCount > 0 ? (
                      <Button variant="outline" size="sm" onClick={list.clearAll}>
                        Clear all filters
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
            {stats.data && <PaginationControls {...stats.data} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} isFetching={stats.isFetching} />}
          </>
        )}
      </Card>
    </>
  );
}
