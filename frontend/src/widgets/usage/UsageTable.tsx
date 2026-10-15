import type { UsageRecord } from '@/models/usage-record';
import { formatUtcDateTime } from '@/utils/dateUtils';
import { shortId } from '@/utils/formatUtils';
import { formatUnits } from '@/utils/numberUtils';
import { DataTable, type Column } from '@/widgets/common/DataTable';
import { EmptyState } from '@/widgets/common/EmptyState';
import { OutcomeBadge, RuleCell } from './OutcomeBadge';

const columns: Column<UsageRecord>[] = [
  { key: 'time', header: 'Time (UTC)', cell: (row) => <span className="whitespace-nowrap text-xs">{formatUtcDateTime(row.createdAt)}</span> },
  {
    key: 'id',
    header: 'Record',
    cell: (row) => (
      <span className="font-mono text-[11px] text-slate-500" title={row.id}>
        {shortId(row.id)}
      </span>
    ),
    hideBelow: 'lg',
  },
  {
    key: 'account',
    header: 'Account',
    cell: (row) => (
      <span className="whitespace-nowrap" title={row.accountId}>
        {row.accountName}
      </span>
    ),
    hideBelow: 'md',
  },
  { key: 'user', header: 'User', cell: (row) => <span className="font-mono text-xs">{row.externalUserId}</span> },
  {
    key: 'request',
    header: 'Request id',
    cell: (row) => (
      <span className="font-mono text-[11px] text-slate-600" title={row.requestId}>
        {shortId(row.requestId, 14)}
        {row.replayCount > 0 && <span className="ml-1 text-sky-600">↻{row.replayCount}</span>}
      </span>
    ),
    hideBelow: 'md',
  },
  {
    key: 'units',
    header: 'Units (req / used)',
    cell: (row) => `${formatUnits(row.unitsRequested)} / ${formatUnits(row.unitsConsumed)}`,
    align: 'right',
  },
  { key: 'outcome', header: 'Outcome', cell: (row) => <OutcomeBadge outcome={row.outcome} /> },
  { key: 'rule', header: 'Rule · level', cell: (row) => <RuleCell rule={row.rejectionRule} level={row.rejectionLevel} />, hideBelow: 'sm' },
  {
    key: 'plans',
    header: 'Plan versions',
    cell: (row) => (
      <span className="whitespace-nowrap text-xs text-slate-500">
        A: {row.accountPlan.planName} v{row.accountPlan.version}
        <br />
        U: {row.userPlan.planName} v{row.userPlan.version}
      </span>
    ),
    hideBelow: 'lg',
  },
];

export function UsageTable({ records, isLoading, onSelect, hasFilters }: { records: UsageRecord[] | undefined; isLoading: boolean; onSelect: (record: UsageRecord) => void; hasFilters: boolean }) {
  return (
    <DataTable
      caption="Usage and request history"
      columns={columns}
      rows={records}
      getRowKey={(row) => row.id}
      isLoading={isLoading}
      onRowClick={onSelect}
      empty={<EmptyState title={hasFilters ? 'No records match these filters' : 'No requests recorded yet'} description="Accepted and rejected consume requests are recorded here. Dry-run checks are not." />}
    />
  );
}
