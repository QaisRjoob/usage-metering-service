import { Link, useNavigate } from 'react-router';
import type { AdminUserListItem } from '@/models/directory';
import { QUOTA_STATUSES, STATUS_LABELS, type QuotaStatus } from '@/models/quota';
import { buildAccountDetailsPath, buildOperatorUserPath } from '@/routing/routePaths';
import { formatMonthLabel, formatUtcDateTime, recentMonths } from '@/utils/dateUtils';
import { planFacetLabel, shortId } from '@/utils/formatUtils';
import { formatUnits } from '@/utils/numberUtils';
import { useOperatorUsersViewModel } from '@/view_models/useOperatorUsersViewModel';
import { DataTable, type Column } from '@/widgets/common/DataTable';
import { EmptyState } from '@/widgets/common/EmptyState';
import { ErrorState } from '@/widgets/common/ErrorState';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { LastActivityCell, RequestCountsCell } from '@/widgets/directory/ActivityCells';
import { AccountPicker } from '@/widgets/filters/AccountPicker';
import { CategoryGroup, CategoryPanel, CategoryTabs } from '@/widgets/filters/CategoryTabs';
import { buildChips, countActive } from '@/widgets/filters/chips';
import { FilterBar } from '@/widgets/filters/FilterBar';
import { DateRangeFilter, RangeFilter, SelectFilter } from '@/widgets/filters/FilterFields';
import { QuotaProgressBar } from '@/widgets/quotas/QuotaProgressBar';
import { QuotaStatusBadge } from '@/widgets/quotas/QuotaStatusBadge';
import { Button } from '@/widgets/ui/Button';
import { Card } from '@/widgets/ui/Card';

const columns: Column<AdminUserListItem>[] = [
  {
    key: 'user',
    header: 'User',
    sortKey: 'externalUserId',
    firstOrder: 'asc',
    cell: (row) => (
      <div className="min-w-0">
        <p className="font-mono text-sm font-medium text-slate-900">{row.externalUserId}</p>
        <p className="text-[11px] text-slate-400" title={row.id}>
          {row.displayName ?? 'No display name'} · {shortId(row.id)}
        </p>
      </div>
    ),
  },
  {
    key: 'company',
    header: 'Company',
    sortKey: 'accountName',
    firstOrder: 'asc',
    cell: (row) => (
      <Link to={buildAccountDetailsPath(row.account.id)} className="whitespace-nowrap font-medium text-slate-700 hover:text-brand-700 hover:underline" onClick={(event) => event.stopPropagation()}>
        {row.account.name}
      </Link>
    ),
  },
  {
    key: 'plan',
    header: 'Plan',
    cell: (row) => (
      <div className="whitespace-nowrap">
        <p>{row.quota.planName}</p>
        <p className="text-[11px] text-slate-400">{formatUnits(row.quota.remaining)} left</p>
      </div>
    ),
    hideBelow: 'md',
  },
  {
    key: 'usage',
    header: 'Used / allowance',
    sortKey: 'consumed',
    cell: (row) => (
      <span className="whitespace-nowrap text-xs tabular-nums">
        {formatUnits(row.quota.consumed)} / {formatUnits(row.quota.monthlyAllowance)}
      </span>
    ),
    hideBelow: 'lg',
  },
  {
    key: 'utilization',
    header: 'Utilization',
    sortKey: 'utilization',
    cell: (row) => <QuotaProgressBar className="min-w-32" utilizationPercent={row.quota.utilizationPercent} status={row.quota.status} label={`${row.externalUserId} utilization`} />,
  },
  { key: 'status', header: 'Status', cell: (row) => <QuotaStatusBadge status={row.quota.status} />, hideBelow: 'sm' },
  { key: 'requests', header: 'Requests', sortKey: 'rejected', cell: (row) => <RequestCountsCell activity={row.activity} />, hideBelow: 'md' },
  { key: 'lastActivity', header: 'Last request', sortKey: 'lastActivity', cell: (row) => <LastActivityCell lastRequestAt={row.activity.lastRequestAt} />, hideBelow: 'lg' },
  { key: 'created', header: 'Registered (UTC)', sortKey: 'createdAt', cell: (row) => <span className="whitespace-nowrap text-xs">{formatUtcDateTime(row.createdAt)}</span>, hideBelow: 'lg' },
];

const ADVANCED = ['accountId', 'minUtilization', 'maxUtilization', 'createdFrom', 'createdTo', 'month'];

/** Operator: every company's end users in one directory (read-only). */
export default function OperatorUsersView() {
  const vm = useOperatorUsersViewModel();
  const { list } = vm;
  const navigate = useNavigate();
  const f = list.filters;
  const facets = vm.facets.data;

  const chips = buildChips(
    f,
    [
      { key: 'search', label: 'Search' },
      { key: 'accountId', label: 'Company', format: (value) => vm.users.data?.items.find((user) => user.account.id === value)?.account.name ?? shortId(value) },
      { key: 'status', label: 'Status', format: (value) => STATUS_LABELS[value as QuotaStatus] ?? value },
      { key: 'activity', label: 'Activity' },
      { key: 'planId', label: 'Plan', format: vm.planName },
      { range: ['minUtilization', 'maxUtilization'], label: 'Utilization', unit: '%' },
      { key: 'createdFrom', label: 'Registered from' },
      { key: 'createdTo', label: 'Registered to' },
      { key: 'month', label: 'Month', format: formatMonthLabel },
    ],
    list.set,
  );

  return (
    <>
      <PageHeader
        title="Users directory"
        description="End users of every company with their individual quota and request activity. Search by user id or name, narrow to one company, browse by category; click a row for the user's statistics and activity, or the company name to open the company. Quotas refer to the selected UTC month."
      />
      <Card>
        <CategoryPanel>
          <CategoryGroup title="Quota status">
            <CategoryTabs
              label="Quota status"
              value={f.status ?? ''}
              onChange={(value) => list.set({ status: value })}
              options={[
                { value: '', label: 'All', count: facets?.total },
                ...QUOTA_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status], count: facets?.byStatus[status] })),
              ]}
            />
          </CategoryGroup>
          <CategoryGroup title="Activity this month">
            <CategoryTabs
              label="Activity this month"
              value={f.activity ?? ''}
              onChange={(value) => list.set({ activity: value })}
              options={[
                { value: '', label: 'All', count: facets?.total },
                { value: 'active', label: 'Active', count: facets?.byActivity.active },
                { value: 'inactive', label: 'No requests', count: facets?.byActivity.inactive },
              ]}
            />
          </CategoryGroup>
          <CategoryGroup title="Plan">
            <CategoryTabs
              label="Plan"
              value={f.planId ?? ''}
              onChange={(value) => list.set({ planId: value })}
              options={[{ value: '', label: 'All plans', count: facets?.total }, ...(facets?.byPlan ?? []).map((plan) => ({ value: plan.planId, label: planFacetLabel(plan), count: plan.count }))]}
            />
          </CategoryGroup>
        </CategoryPanel>
        <FilterBar
          search={{ value: f.search ?? '', onChange: (value) => list.set({ search: value }), placeholder: 'User id, display name or internal id', label: 'Search users' }}
          advancedActiveCount={countActive(f, ADVANCED)}
          advanced={
            <>
              <AccountPicker label="Company" value={f.accountId ?? ''} onChange={(value) => list.set({ accountId: value })} />
              <RangeFilter
                label="Utilization"
                unit="%"
                min={f.minUtilization ?? ''}
                max={f.maxUtilization ?? ''}
                onChange={(min, max) => list.set({ minUtilization: min, maxUtilization: max })}
                error={list.errors.minUtilization ?? list.errors.maxUtilization}
              />
              <DateRangeFilter
                label="Registered"
                from={f.createdFrom ?? ''}
                to={f.createdTo ?? ''}
                onChange={(from, to) => list.set({ createdFrom: from, createdTo: to })}
                error={list.errors.createdFrom ?? list.errors.createdTo}
              />
              <SelectFilter
                label="Quota month (UTC)"
                value={f.month ?? ''}
                onChange={(value) => list.set({ month: value })}
                options={recentMonths(12).map((month) => ({ value: month, label: formatMonthLabel(month) }))}
                allLabel="Current month"
              />
            </>
          }
          chips={chips}
          onClearAll={list.clearAll}
          totalItems={vm.users.data?.totalItems}
          isFetching={vm.users.isFetching}
        />
        {!list.isValid ? (
          <p role="alert" className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Fix the highlighted filter to see results.
          </p>
        ) : vm.users.error && !vm.users.data ? (
          <ErrorState className="m-4" error={vm.users.error} onRetry={() => void vm.users.refetch()} />
        ) : (
          <>
            <DataTable
              caption="Users of every company"
              columns={columns}
              rows={vm.users.data?.items}
              getRowKey={(row) => row.id}
              isLoading={vm.users.isPending || vm.users.isFetching}
              onRowClick={(row) => navigate(buildOperatorUserPath(row.account.id, row.externalUserId))}
              sort={{ field: list.sort, order: list.order }}
              onSort={list.setSort}
              empty={
                <EmptyState
                  title={list.activeCount > 0 ? 'No users match these filters' : 'No users yet'}
                  description={list.activeCount > 0 ? 'Remove a filter or clear them all.' : 'Companies register their users with their API key.'}
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
            {vm.users.data && <PaginationControls {...vm.users.data} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} isFetching={vm.users.isFetching} />}
          </>
        )}
      </Card>
    </>
  );
}
