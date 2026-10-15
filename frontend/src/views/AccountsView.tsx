import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Plus, Search } from 'lucide-react';
import type { AccountListItem } from '@/models/account';
import { QUOTA_STATUSES, STATUS_LABELS } from '@/models/quota';
import { buildAccountDetailsPath } from '@/routing/routePaths';
import { formatUtcDateTime } from '@/utils/dateUtils';
import { shortId } from '@/utils/formatUtils';
import { formatUnits } from '@/utils/numberUtils';
import { useAccountsViewModel } from '@/view_models/useAccountsViewModel';
import { CredentialsGate } from '@/widgets/common/CredentialsGate';
import { DataTable, type Column } from '@/widgets/common/DataTable';
import { EmptyState } from '@/widgets/common/EmptyState';
import { ErrorState } from '@/widgets/common/ErrorState';
import { PageHeader } from '@/widgets/common/PageHeader';
import { PaginationControls } from '@/widgets/common/PaginationControls';
import { AccountForm, IssuedApiKey } from '@/widgets/forms/AccountForm';
import { QuotaProgressBar } from '@/widgets/quotas/QuotaProgressBar';
import { QuotaStatusBadge } from '@/widgets/quotas/QuotaStatusBadge';
import { Button } from '@/widgets/ui/Button';
import { Card } from '@/widgets/ui/Card';
import { Dialog } from '@/widgets/ui/Dialog';
import { Input, Select } from '@/widgets/ui/Field';

const columns: Column<AccountListItem>[] = [
  {
    key: 'name',
    header: 'Account',
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
  { key: 'plan', header: 'Plan', cell: (row) => <span className="whitespace-nowrap">{row.quota.planName}</span>, hideBelow: 'sm' },
  { key: 'users', header: 'Users', cell: (row) => formatUnits(row.userCount), align: 'right', hideBelow: 'lg' },
  {
    key: 'usage',
    header: 'Usage this month',
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
    cell: (row) => <QuotaProgressBar className="min-w-36" utilizationPercent={row.quota.utilizationPercent} status={row.quota.status} label={`${row.name} utilization`} />,
  },
  { key: 'status', header: 'Status', cell: (row) => <QuotaStatusBadge status={row.quota.status} /> },
  { key: 'created', header: 'Created', cell: (row) => <span className="whitespace-nowrap text-xs">{formatUtcDateTime(row.createdAt)}</span>, hideBelow: 'lg' },
];

function AccountsContent() {
  const vm = useAccountsViewModel();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const closeDialog = () => {
    setDialogOpen(false);
    vm.dismissCreatedAccount();
  };
  const hasFilters = Boolean(vm.params.search || vm.params.status);

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Calling applications (tenants). Each account has one API key and an account plan shared by all of its users."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" aria-hidden="true" /> Create account
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Search accounts</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input className="pl-9" placeholder="Search by name or id" value={vm.searchDraft} onChange={(event) => vm.setSearchDraft(event.target.value)} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            <span className="mb-1 block">Status</span>
            <Select value={vm.params.status ?? ''} onChange={(event) => vm.setStatus(event.target.value)} className="h-9 w-44">
              <option value="">All statuses</option>
              {QUOTA_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            <span className="mb-1 block">Sort</span>
            <Select value={`${vm.params.sort}:${vm.params.order}`} onChange={(event) => vm.setSort(event.target.value)} className="h-9 w-48">
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="name:asc">Name A–Z</option>
              <option value="name:desc">Name Z–A</option>
              <option value="utilization:desc">Highest utilization</option>
              <option value="utilization:asc">Lowest utilization</option>
            </Select>
          </label>
        </div>
        {vm.error && !vm.accounts ? (
          <ErrorState className="m-4" error={vm.error} onRetry={vm.refetch} />
        ) : (
          <>
            <DataTable
              caption="Accounts"
              columns={columns}
              rows={vm.accounts?.items}
              getRowKey={(row) => row.id}
              isLoading={vm.isLoading || vm.isFetching}
              onRowClick={(row) => navigate(buildAccountDetailsPath(row.id))}
              empty={
                <EmptyState
                  title={hasFilters ? 'No accounts match these filters' : 'No accounts yet'}
                  description={hasFilters ? 'Try a different search or status.' : 'Create the first account to issue an API key.'}
                />
              }
            />
            {vm.accounts && (
              <PaginationControls {...vm.accounts} onPageChange={vm.setPage} onPageSizeChange={vm.setPageSize} isFetching={vm.isFetching} />
            )}
          </>
        )}
      </Card>

      <Dialog open={dialogOpen} onClose={closeDialog} title={vm.createdAccount ? 'API key issued' : 'Create account'}>
        {vm.createdAccount ? (
          <IssuedApiKey result={vm.createdAccount} onConnect={vm.connectCreatedAccount} onDone={closeDialog} />
        ) : (
          <AccountForm onSubmit={(request) => vm.createAccount.mutate(request)} submitting={vm.createAccount.isPending} error={vm.createAccount.error} onCancel={closeDialog} />
        )}
      </Dialog>
    </>
  );
}

export default function AccountsView() {
  return (
    <CredentialsGate scope="admin">
      <AccountsContent />
    </CredentialsGate>
  );
}
