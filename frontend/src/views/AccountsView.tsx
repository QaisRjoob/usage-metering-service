import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import type { AccountListItem } from '@/models/account';
import { QUOTA_STATUSES, STATUS_LABELS, type QuotaStatus } from '@/models/quota';
import { buildAccountDetailsPath } from '@/routing/routePaths';
import { formatMonthLabel, formatUtcDateTime, recentMonths } from '@/utils/dateUtils';
import { planFacetLabel, shortId } from '@/utils/formatUtils';
import { formatUnits } from '@/utils/numberUtils';
import { useAccountsViewModel } from '@/view_models/useAccountsViewModel';
import { DataTable, type Column } from '@/widgets/common/DataTable';
import { EmptyState } from '@/widgets/common/EmptyState';
import { ErrorState } from '@/widgets/common/ErrorState';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { buildChips, countActive } from '@/widgets/filters/chips';
import { FilterBar } from '@/widgets/filters/FilterBar';
import { CategoryGroup, CategoryPanel, CategoryTabs } from '@/widgets/filters/CategoryTabs';
import { DateRangeFilter, RangeFilter, SelectFilter } from '@/widgets/filters/FilterFields';
import { LastActivityCell, RequestCountsCell } from '@/widgets/directory/ActivityCells';
import { AccountForm, IssuedApiKey } from '@/widgets/forms/AccountForm';
import { QuotaProgressBar } from '@/widgets/quotas/QuotaProgressBar';
import { QuotaStatusBadge } from '@/widgets/quotas/QuotaStatusBadge';
import { Button } from '@/widgets/ui/Button';
import { Card } from '@/widgets/ui/Card';
import { Dialog } from '@/widgets/ui/Dialog';

const columns: Column<AccountListItem>[] = [
  {
    key: 'name',
    header: 'Account',
    sortKey: 'name',
    firstOrder: 'asc',
    cell: (row) => (
      <div className="min-w-0">
        <Link to={buildAccountDetailsPath(row.id)} className="font-medium text-slate-900 hover:text-brand-700 hover:underline" onClick={(event) => event.stopPropagation()}>
          {row.name}
        </Link>
        <p className="font-mono text-[11px] text-slate-400" title={row.id}>
          {shortId(row.id)} · {row.apiKeyPrefix}…
        </p>
      </div>
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
    hideBelow: 'sm',
  },
  { key: 'users', header: 'Users', sortKey: 'userCount', cell: (row) => formatUnits(row.userCount), align: 'right', hideBelow: 'lg' },
  {
    key: 'usage',
    header: 'Used / allowance',
    sortKey: 'consumed',
    cell: (row) => (
      <span className="whitespace-nowrap text-xs tabular-nums">
        {formatUnits(row.quota.consumed)} / {formatUnits(row.quota.monthlyAllowance)}
      </span>
    ),
    hideBelow: 'md',
  },
  {
    key: 'utilization',
    header: 'Utilization',
    sortKey: 'utilization',
    cell: (row) => <QuotaProgressBar className="min-w-36" utilizationPercent={row.quota.utilizationPercent} status={row.quota.status} label={`${row.name} utilization`} />,
  },
  { key: 'status', header: 'Status', cell: (row) => <QuotaStatusBadge status={row.quota.status} /> },
  { key: 'requests', header: 'Requests', sortKey: 'rejected', cell: (row) => <RequestCountsCell activity={row.activity} />, hideBelow: 'md' },
  { key: 'lastActivity', header: 'Last request', sortKey: 'lastActivity', cell: (row) => <LastActivityCell lastRequestAt={row.activity.lastRequestAt} />, hideBelow: 'lg' },
  { key: 'created', header: 'Created (UTC)', sortKey: 'createdAt', cell: (row) => <span className="whitespace-nowrap text-xs">{formatUtcDateTime(row.createdAt)}</span>, hideBelow: 'lg' },
];

const ADVANCED = ['planKind', 'hasRejections', 'minUsers', 'maxUsers', 'minUtilization', 'maxUtilization', 'createdFrom', 'createdTo', 'month'];

export default function AccountsView() {
  const vm = useAccountsViewModel();
  const { list } = vm;
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const closeDialog = () => {
    setDialogOpen(false);
    vm.dismissCreatedAccount();
  };
  const f = list.filters;
  const facets = vm.facets.data;

  const chips = buildChips(
    f,
    [
      { key: 'search', label: 'Search' },
      { key: 'status', label: 'Status', format: (value) => STATUS_LABELS[value as QuotaStatus] ?? value },
      { key: 'activity', label: 'Activity' },
      { key: 'planId', label: 'Plan', format: vm.planName },
      { key: 'planKind', label: 'Plan type' },
      { key: 'hasRejections', label: 'Rejections', format: (value) => (value === 'true' ? 'some this month' : 'none this month') },
      { range: ['minUsers', 'maxUsers'], label: 'Users' },
      { range: ['minUtilization', 'maxUtilization'], label: 'Utilization', unit: '%' },
      { key: 'createdFrom', label: 'Created from' },
      { key: 'createdTo', label: 'Created to' },
      { key: 'month', label: 'Month', format: formatMonthLabel },
    ],
    list.set,
  );

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Every company using the service. Search by name, account id, API key prefix or one of its user ids; browse by category; click a column title to sort. Quotas and request counts refer to the selected UTC month."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" aria-hidden="true" /> Create account
          </Button>
        }
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
          search={{ value: f.search ?? '', onChange: (value) => list.set({ search: value }), placeholder: 'Name, account id, key prefix or user id', label: 'Search accounts' }}
          advancedActiveCount={countActive(f, ADVANCED)}
          advanced={
            <>
              <SelectFilter
                label="Plan type"
                value={f.planKind ?? ''}
                onChange={(value) => list.set({ planKind: value })}
                options={[
                  { value: 'predefined', label: 'Predefined (Starter, Pro)' },
                  { value: 'custom', label: 'Custom plan' },
                ]}
                allLabel="Any type"
              />
              <SelectFilter
                label="Rejections this month"
                value={f.hasRejections ?? ''}
                onChange={(value) => list.set({ hasRejections: value })}
                options={[
                  { value: 'true', label: 'At least one rejection' },
                  { value: 'false', label: 'No rejections' },
                ]}
                allLabel="Any"
              />
              <RangeFilter
                label="Users"
                min={f.minUsers ?? ''}
                max={f.maxUsers ?? ''}
                onChange={(min, max) => list.set({ minUsers: min, maxUsers: max })}
                error={list.errors.minUsers ?? list.errors.maxUsers}
              />
              <RangeFilter
                label="Utilization"
                unit="%"
                min={f.minUtilization ?? ''}
                max={f.maxUtilization ?? ''}
                onChange={(min, max) => list.set({ minUtilization: min, maxUtilization: max })}
                error={list.errors.minUtilization ?? list.errors.maxUtilization}
              />
              <DateRangeFilter
                label="Created"
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
          totalItems={vm.accounts.data?.totalItems}
          isFetching={vm.accounts.isFetching}
        />
        {!list.isValid ? (
          <p role="alert" className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Fix the highlighted filter to see results.
          </p>
        ) : vm.accounts.error && !vm.accounts.data ? (
          <ErrorState className="m-4" error={vm.accounts.error} onRetry={() => void vm.accounts.refetch()} />
        ) : (
          <>
            <DataTable
              caption="Accounts"
              columns={columns}
              rows={vm.accounts.data?.items}
              getRowKey={(row) => row.id}
              isLoading={vm.accounts.isPending || vm.accounts.isFetching}
              onRowClick={(row) => navigate(buildAccountDetailsPath(row.id))}
              sort={{ field: list.sort, order: list.order }}
              onSort={list.setSort}
              empty={
                <EmptyState
                  title={list.activeCount > 0 ? 'No accounts match these filters' : 'No accounts yet'}
                  description={list.activeCount > 0 ? 'Remove a filter or clear them all.' : 'Create the first account to issue an API key.'}
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
            {vm.accounts.data && <PaginationControls {...vm.accounts.data} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} isFetching={vm.accounts.isFetching} />}
          </>
        )}
      </Card>

      <Dialog open={dialogOpen} onClose={closeDialog} title={vm.createdAccount ? 'API key issued' : 'Create account'}>
        {vm.createdAccount ? (
          <IssuedApiKey result={vm.createdAccount} onDone={closeDialog} />
        ) : (
          <AccountForm onSubmit={(request) => vm.createAccount.mutate(request)} submitting={vm.createAccount.isPending} error={vm.createAccount.error} onCancel={closeDialog} />
        )}
      </Dialog>
    </>
  );
}
