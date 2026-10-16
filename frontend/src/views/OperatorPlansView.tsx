import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import type { AdminPlanListItem } from '@/models/plan';
import { adminListPlansQuerySchema } from '@/models/plan';
import { useListQuery } from '@/hooks/useListQuery';
import { useServices } from '@/providers/ServicesProvider';
import { formatUtcDateTime } from '@/utils/dateUtils';
import { formatUnits } from '@/utils/numberUtils';
import { queryKeys, staleTimes } from '@/utils/queryKeys';
import { DataTable, type Column } from '@/widgets/common/DataTable';
import { EmptyState } from '@/widgets/common/EmptyState';
import { ErrorState } from '@/widgets/common/ErrorState';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { AccountPicker } from '@/widgets/filters/AccountPicker';
import { buildChips, countActive } from '@/widgets/filters/chips';
import { FilterBar } from '@/widgets/filters/FilterBar';
import { SegmentedFilter, SelectFilter } from '@/widgets/filters/FilterFields';
import { Badge } from '@/widgets/ui/Badge';
import { Button } from '@/widgets/ui/Button';
import { Card } from '@/widgets/ui/Card';

const FIELDS = ['search', 'scope', 'kind', 'ownerAccountId'] as const;

const columns: Column<AdminPlanListItem>[] = [
  {
    key: 'name',
    header: 'Plan',
    sortKey: 'name',
    firstOrder: 'asc',
    cell: (plan) => (
      <div>
        <p className="font-medium text-slate-900">{plan.name}</p>
        {plan.description && <p className="max-w-xs truncate text-xs text-slate-500">{plan.description}</p>}
      </div>
    ),
  },
  { key: 'scope', header: 'Scope', cell: (plan) => <Badge tone={plan.scope === 'account' ? 'brand' : 'info'}>{plan.scope === 'account' ? 'Account' : 'User'}</Badge> },
  {
    key: 'owner',
    header: 'Owner',
    cell: (plan) =>
      plan.isPredefined ? (
        <Badge tone="neutral">
          <Lock className="size-3" aria-hidden="true" /> Predefined
        </Badge>
      ) : (
        <span className="text-sm">{plan.ownerAccountName}</span>
      ),
  },
  { key: 'monthly', header: 'Monthly', sortKey: 'monthlyAllowance', cell: (plan) => formatUnits(plan.currentVersion.monthlyAllowance), align: 'right' },
  { key: 'perRequest', header: 'Max / request', sortKey: 'maxUnitsPerRequest', cell: (plan) => formatUnits(plan.currentVersion.maxUnitsPerRequest), align: 'right', hideBelow: 'sm' },
  { key: 'version', header: 'Version', cell: (plan) => `v${plan.currentVersion.version}`, hideBelow: 'md' },
  {
    key: 'assigned',
    header: 'In use by',
    cell: (plan) => (
      <span className="whitespace-nowrap text-xs text-slate-600">
        {plan.assignedAccounts} accounts · {plan.assignedUsers} users
      </span>
    ),
    hideBelow: 'md',
  },
  { key: 'created', header: 'Created (UTC)', sortKey: 'createdAt', cell: (plan) => <span className="whitespace-nowrap text-xs">{formatUtcDateTime(plan.createdAt)}</span>, hideBelow: 'lg' },
];

/** Operator: the whole plan catalogue - predefined plans and every account's custom plans. */
export default function OperatorPlansView() {
  const { plans } = useServices();
  const list = useListQuery(adminListPlansQuerySchema, FIELDS, { pageSize: 20, order: 'asc' });
  const query = useQuery({
    queryKey: queryKeys.admin.plans(list.query ?? {}),
    queryFn: () => plans.listAllPlans(list.query!),
    enabled: list.isValid,
    staleTime: staleTimes.plans,
    placeholderData: keepPreviousData,
  });
  const f = list.filters;

  return (
    <>
      <PageHeader
        title="Plan catalogue"
        description="Every plan in the service: the predefined plans and the custom plans each account created. Read-only; accounts edit their own custom plans in their portal."
      />
      <Card>
        <FilterBar
          search={{ value: f.search ?? '', onChange: (value) => list.set({ search: value }), placeholder: 'Search plan name or description', label: 'Search plans' }}
          quick={
            <SegmentedFilter
              label="Plan type"
              value={(f.kind as 'predefined' | 'custom' | undefined) ?? ''}
              onChange={(value) => list.set({ kind: value })}
              options={[
                { value: '', label: 'All' },
                { value: 'predefined', label: 'Predefined' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
          }
          advancedActiveCount={countActive(f, ['scope', 'ownerAccountId'])}
          advanced={
            <>
              <SelectFilter
                label="Scope"
                value={f.scope ?? ''}
                onChange={(value) => list.set({ scope: value })}
                options={[
                  { value: 'account', label: 'Account plans (shared)' },
                  { value: 'user', label: 'User plans (individual)' },
                ]}
                allLabel="Account and user"
              />
              <AccountPicker label="Owner account" value={f.ownerAccountId ?? ''} onChange={(value) => list.set({ ownerAccountId: value })} />
            </>
          }
          chips={buildChips(
            f,
            [
              { key: 'search', label: 'Search' },
              { key: 'kind', label: 'Type' },
              { key: 'scope', label: 'Scope' },
              { key: 'ownerAccountId', label: 'Owner', format: () => 'selected account' },
            ],
            list.set,
          )}
          onClearAll={list.clearAll}
          totalItems={query.data?.totalItems}
          isFetching={query.isFetching}
        />
        {query.error && !query.data ? (
          <ErrorState className="m-4" error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <>
            <DataTable
              caption="Plan catalogue"
              columns={columns}
              rows={query.data?.items}
              getRowKey={(plan) => plan.id}
              isLoading={query.isPending || query.isFetching}
              sort={{ field: list.sort, order: list.order }}
              onSort={list.setSort}
              empty={
                <EmptyState
                  title="No plans match"
                  action={
                    <Button variant="outline" size="sm" onClick={list.clearAll}>
                      Clear all filters
                    </Button>
                  }
                />
              }
            />
            {query.data && <PaginationControls {...query.data} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} isFetching={query.isFetching} />}
          </>
        )}
      </Card>
    </>
  );
}
