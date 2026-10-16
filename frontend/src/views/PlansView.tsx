import { Lock, Plus } from 'lucide-react';
import type { Plan } from '@/models/plan';
import { formatUtcDateTime } from '@/utils/dateUtils';
import { formatUnits } from '@/utils/numberUtils';
import { usePlansViewModel } from '@/view_models/usePlansViewModel';
import { DataTable, type Column } from '@/widgets/common/DataTable';
import { EmptyState } from '@/widgets/common/EmptyState';
import { ErrorState } from '@/widgets/common/ErrorState';
import { TableSkeleton } from '@/widgets/common/LoadingSkeleton';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { buildChips } from '@/widgets/filters/chips';
import { FilterBar } from '@/widgets/filters/FilterBar';
import { SegmentedFilter } from '@/widgets/filters/FilterFields';
import { PlanForm } from '@/widgets/forms/PlanForm';
import { Badge } from '@/widgets/ui/Badge';
import { Button } from '@/widgets/ui/Button';
import { Card } from '@/widgets/ui/Card';
import { Dialog } from '@/widgets/ui/Dialog';

function PlansContent() {
  const vm = usePlansViewModel();
  const { list } = vm;
  const f = list.filters;

  const columns: Column<Plan>[] = [
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
      key: 'kind',
      header: 'Type',
      cell: (plan) =>
        plan.isPredefined ? (
          <Badge tone="neutral">
            <Lock className="size-3" aria-hidden="true" /> Predefined
          </Badge>
        ) : (
          <Badge tone="success">Custom</Badge>
        ),
      hideBelow: 'sm',
    },
    { key: 'monthly', header: 'Monthly allowance', sortKey: 'monthlyAllowance', cell: (plan) => formatUnits(plan.currentVersion.monthlyAllowance), align: 'right' },
    { key: 'perRequest', header: 'Max / request', sortKey: 'maxUnitsPerRequest', cell: (plan) => formatUnits(plan.currentVersion.maxUnitsPerRequest), align: 'right' },
    { key: 'version', header: 'Version', cell: (plan) => `v${plan.currentVersion.version}`, hideBelow: 'md' },
    { key: 'updated', header: 'Updated (UTC)', cell: (plan) => <span className="whitespace-nowrap text-xs">{formatUtcDateTime(plan.updatedAt)}</span>, hideBelow: 'lg' },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (plan) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => vm.openDetails(plan.id)}>
            Versions
          </Button>
          {!plan.isPredefined && (
            <Button variant="outline" size="sm" onClick={() => vm.openEdit(plan)}>
              Edit
            </Button>
          )}
        </div>
      ),
    },
  ];

  const details = vm.details.data;
  return (
    <>
      <PageHeader
        title="Plans"
        description="Predefined plans are read-only. Your custom plans are private to your account; every limit change creates a new version. Search, filter and click a column to sort."
        actions={
          <Button onClick={vm.openCreate}>
            <Plus className="size-4" aria-hidden="true" /> New custom plan
          </Button>
        }
      />
      <Card>
        <FilterBar
          search={{ value: f.search ?? '', onChange: (value) => list.set({ search: value }), placeholder: 'Search plan name or description', label: 'Search plans' }}
          quick={
            <>
              <SegmentedFilter
                label="Plan type"
                value={(f.kind as 'predefined' | 'custom' | undefined) ?? ''}
                onChange={(value) => list.set({ kind: value })}
                options={[
                  { value: '', label: 'All plans' },
                  { value: 'predefined', label: 'Predefined' },
                  { value: 'custom', label: 'My custom plans' },
                ]}
              />
              <SegmentedFilter
                label="Scope"
                value={(f.scope as 'account' | 'user' | undefined) ?? ''}
                onChange={(value) => list.set({ scope: value })}
                options={[
                  { value: '', label: 'Account and user' },
                  { value: 'account', label: 'Account plans' },
                  { value: 'user', label: 'User plans' },
                ]}
              />
            </>
          }
          chips={buildChips(
            f,
            [
              { key: 'search', label: 'Search' },
              { key: 'kind', label: 'Type' },
              { key: 'scope', label: 'Scope' },
            ],
            list.set,
          )}
          onClearAll={list.clearAll}
          totalItems={vm.plans.data?.totalItems}
          isFetching={vm.plans.isFetching}
        />
        {vm.plans.error && !vm.plans.data ? (
          <ErrorState className="m-4" error={vm.plans.error} onRetry={() => void vm.plans.refetch()} />
        ) : (
          <>
            <DataTable
              caption="Plans"
              columns={columns}
              rows={vm.plans.data?.items}
              getRowKey={(plan) => plan.id}
              isLoading={vm.plans.isPending || vm.plans.isFetching}
              sort={{ field: list.sort, order: list.order }}
              onSort={list.setSort}
              empty={<EmptyState title="No plans match" description="Create a custom plan or change the filters." action={list.activeCount > 0 ? <Button variant="outline" size="sm" onClick={list.clearAll}>Clear all filters</Button> : undefined} />}
            />
            {vm.plans.data && <PaginationControls {...vm.plans.data} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} isFetching={vm.plans.isFetching} />}
          </>
        )}
      </Card>

      <Dialog open={vm.editor !== null} onClose={vm.closeEditor} title={vm.editor?.mode === 'edit' ? `Edit ${vm.editor.plan.name}` : 'New custom plan'} size="lg">
        {vm.editor && (
          <PlanForm
            key={vm.editor.mode === 'edit' ? vm.editor.plan.id : 'create'}
            plan={vm.editor.mode === 'edit' ? vm.editor.plan : undefined}
            accountQuota={vm.accountQuota}
            submitting={vm.createPlan.isPending || vm.updatePlan.isPending}
            error={vm.createPlan.error ?? vm.updatePlan.error}
            onCreate={(request) => vm.createPlan.mutate(request)}
            onUpdate={(request) => vm.editor?.mode === 'edit' && vm.updatePlan.mutate({ planId: vm.editor.plan.id, request })}
            onCancel={vm.closeEditor}
          />
        )}
      </Dialog>

      <Dialog open={vm.selectedPlanId !== null} onClose={vm.closeDetails} title={details ? `${details.name} — versions` : 'Plan versions'} size="lg">
        {vm.details.error ? (
          <ErrorState compact error={vm.details.error} onRetry={() => void vm.details.refetch()} />
        ) : !details ? (
          <TableSkeleton rows={3} columns={4} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              In your account this plan is assigned to {details.assignedAccounts} account and {details.assignedUsers} users. Historical requests keep the version that was current when they were decided.
            </p>
            <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {details.versions.map((version) => (
                <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="font-medium">
                    v{version.version} {version.id === details.currentVersion.id && <Badge tone="brand">current</Badge>}
                  </span>
                  <span className="tabular-nums text-slate-600">
                    {formatUnits(version.monthlyAllowance)}/month · {formatUnits(version.maxUnitsPerRequest)}/request
                  </span>
                  <span className="text-xs text-slate-500">{formatUtcDateTime(version.createdAt)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Dialog>
    </>
  );
}

export default function PlansView() {
  return <PlansContent />;
}
