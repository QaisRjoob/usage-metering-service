import { Lock, Plus } from 'lucide-react';
import type { Plan } from '@/models/plan';
import { formatUtcDateTime } from '@/utils/dateUtils';
import { formatUnits } from '@/utils/numberUtils';
import { usePlansViewModel } from '@/view_models/usePlansViewModel';
import { CredentialsGate } from '@/widgets/common/CredentialsGate';
import { DataTable, type Column } from '@/widgets/common/DataTable';
import { EmptyState } from '@/widgets/common/EmptyState';
import { ErrorState } from '@/widgets/common/ErrorState';
import { TableSkeleton } from '@/widgets/common/LoadingSkeleton';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { PlanForm } from '@/widgets/forms/PlanForm';
import { Badge } from '@/widgets/ui/Badge';
import { Button } from '@/widgets/ui/Button';
import { Card } from '@/widgets/ui/Card';
import { Dialog } from '@/widgets/ui/Dialog';
import { Select } from '@/widgets/ui/Field';

function PlansContent() {
  const vm = usePlansViewModel();

  const columns: Column<Plan>[] = [
    {
      key: 'name',
      header: 'Plan',
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
    { key: 'monthly', header: 'Monthly allowance', cell: (plan) => formatUnits(plan.currentVersion.monthlyAllowance), align: 'right' },
    { key: 'perRequest', header: 'Max / request', cell: (plan) => formatUnits(plan.currentVersion.maxUnitsPerRequest), align: 'right' },
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
        description="Predefined plans are seeded at startup and read-only. Custom plans belong to the connected account only. Every limit change creates a new immutable version."
        actions={
          <Button onClick={vm.openCreate}>
            <Plus className="size-4" aria-hidden="true" /> New custom plan
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <label className="text-xs font-medium text-slate-600">
            <span className="mb-1 block">Type</span>
            <Select className="h-9 w-40" value={vm.params.kind ?? ''} onChange={(event) => vm.setKind(event.target.value)}>
              <option value="">All plans</option>
              <option value="predefined">Predefined</option>
              <option value="custom">Custom</option>
            </Select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            <span className="mb-1 block">Scope</span>
            <Select className="h-9 w-40" value={vm.params.scope ?? ''} onChange={(event) => vm.setScope(event.target.value)}>
              <option value="">Account and user</option>
              <option value="account">Account plans</option>
              <option value="user">User plans</option>
            </Select>
          </label>
        </div>
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
              empty={<EmptyState title="No plans match" description="Create a custom plan or change the filters." />}
            />
            {vm.plans.data && <PaginationControls {...vm.plans.data} onPageChange={vm.setPage} isFetching={vm.plans.isFetching} />}
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
  return (
    <CredentialsGate scope="account">
      <PlansContent />
    </CredentialsGate>
  );
}
