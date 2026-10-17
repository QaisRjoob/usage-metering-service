import type { ReactNode } from 'react';
import type { ActivitySummary } from '@/models/directory';
import type { UserWithQuota } from '@/models/user';
import { formatUnits } from '@/utils/numberUtils';
import { DataTable, type Column } from '@/widgets/common/DataTable';
import { EmptyState } from '@/widgets/common/EmptyState';
import { QuotaProgressBar } from '@/widgets/quotas/QuotaProgressBar';
import { QuotaStatusBadge } from '@/widgets/quotas/QuotaStatusBadge';
import { LastActivityCell, RequestCountsCell } from '@/widgets/directory/ActivityCells';
import { Button } from '@/widgets/ui/Button';

type UserRow = UserWithQuota & { activity?: ActivitySummary };

interface UsersTableProps {
  users: UserRow[] | undefined;
  /** Adds "Requests" and "Last request" columns (rows must carry `activity`). */
  showActivity?: boolean;
  isLoading: boolean;
  onChangePlan?: (user: UserWithQuota) => void;
  emptyHint?: string;
  sort?: { field?: string; order?: 'asc' | 'desc' };
  onSort?: (field: string, firstOrder: 'asc' | 'desc') => void;
  emptyAction?: ReactNode;
  /** Operator: opens the user's details (row click and a Details button). */
  onOpenUser?: (user: UserWithQuota) => void;
}

/** Users with their individual (user-level) quota for the selected month. */
export function UsersTable({ users, isLoading, onChangePlan, emptyHint, sort, onSort, emptyAction, onOpenUser, showActivity = false }: UsersTableProps) {
  const columns: Column<UserRow>[] = [
    {
      key: 'user',
      header: 'User',
      sortKey: 'externalUserId',
      firstOrder: 'asc',
      cell: (row) => (
        <div>
          <p className="font-mono text-xs font-medium text-slate-900">{row.externalUserId}</p>
          {row.displayName && <p className="text-xs text-slate-500">{row.displayName}</p>}
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'User plan',
      cell: (row) => (
        <span className="whitespace-nowrap">
          {row.quota.planName} <span className="text-xs text-slate-400">v{row.quota.planVersion}</span>
        </span>
      ),
    },
    {
      key: 'usage',
      header: 'Used / monthly',
      sortKey: 'consumed',
      cell: (row) => (
        <span className="whitespace-nowrap text-xs tabular-nums">
          {formatUnits(row.quota.consumed)} / {formatUnits(row.quota.monthlyAllowance)}
        </span>
      ),
      hideBelow: 'sm',
    },
    { key: 'remaining', header: 'Remaining', cell: (row) => formatUnits(row.quota.remaining), align: 'right' },
    {
      key: 'utilization',
      header: 'Utilization',
      sortKey: 'utilization',
      cell: (row) => <QuotaProgressBar className="min-w-32" utilizationPercent={row.quota.utilizationPercent} status={row.quota.status} label={`${row.externalUserId} utilization`} />,
      hideBelow: 'md',
    },
    { key: 'status', header: 'Status', cell: (row) => <QuotaStatusBadge status={row.quota.status} />, hideBelow: 'lg' },
  ];
  if (showActivity) {
    columns.push(
      { key: 'requests', header: 'Requests', sortKey: 'rejected', cell: (row) => (row.activity ? <RequestCountsCell activity={row.activity} /> : null), hideBelow: 'md' },
      { key: 'lastActivity', header: 'Last request', sortKey: 'lastActivity', cell: (row) => <LastActivityCell lastRequestAt={row.activity?.lastRequestAt ?? null} />, hideBelow: 'lg' },
    );
  }
  if (onChangePlan) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (row) => (
        <Button variant="outline" size="sm" onClick={() => onChangePlan(row)}>
          Change plan
        </Button>
      ),
      align: 'right',
    });
  }
  if (onOpenUser) {
    columns.push({
      key: 'open',
      header: <span className="sr-only">Details</span>,
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          aria-label={`Details of ${row.externalUserId}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenUser(row);
          }}
        >
          Details
        </Button>
      ),
      align: 'right',
    });
  }
  return (
    <DataTable
      onRowClick={onOpenUser}
      caption="Users"
      columns={columns}
      rows={users}
      getRowKey={(row) => row.id}
      isLoading={isLoading}
      sort={sort}
      onSort={onSort}
      empty={<EmptyState title="No users found" description={emptyHint ?? 'Register a user to start metering their usage.'} action={emptyAction} />}
    />
  );
}
