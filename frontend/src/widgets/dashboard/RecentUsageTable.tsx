import type { UsageRecord } from '@/models/usage-record';
import { formatUtcDateTime } from '@/utils/dateUtils';
import { formatUnits } from '@/utils/numberUtils';
import { DataTable, type Column } from '@/widgets/common/DataTable';
import { EmptyState } from '@/widgets/common/EmptyState';
import { OutcomeBadge, RuleCell } from '@/widgets/usage/OutcomeBadge';

const columns: Column<UsageRecord>[] = [
  { key: 'time', header: 'Time (UTC)', cell: (row) => <span className="whitespace-nowrap text-xs">{formatUtcDateTime(row.createdAt)}</span> },
  { key: 'account', header: 'Account', cell: (row) => row.accountName, hideBelow: 'md' },
  { key: 'user', header: 'User', cell: (row) => <span className="font-mono text-xs">{row.externalUserId}</span> },
  { key: 'units', header: 'Units', cell: (row) => formatUnits(row.unitsRequested), align: 'right' },
  { key: 'outcome', header: 'Outcome', cell: (row) => <OutcomeBadge outcome={row.outcome} /> },
  { key: 'rule', header: 'Rule', cell: (row) => <RuleCell rule={row.rejectionRule} level={row.rejectionLevel} />, hideBelow: 'sm' },
];

export function RecentUsageTable({ records, showAccount = true }: { records: UsageRecord[]; showAccount?: boolean }) {
  return (
    <DataTable
      caption="Recent usage activity"
      columns={showAccount ? columns : columns.filter((column) => column.key !== 'account')}
      rows={records}
      getRowKey={(row) => row.id}
      empty={<EmptyState title="No recent activity" description="Consume requests will appear here." />}
    />
  );
}
