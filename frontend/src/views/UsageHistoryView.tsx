import type { ReactNode } from 'react';
import type { UsageRecord } from '@/models/usage-record';
import { LEVEL_LABELS, RULE_LABELS } from '@/models/quota';
import { formatUtcDateTime } from '@/utils/dateUtils';
import { formatUnits } from '@/utils/numberUtils';
import { useUsageHistoryViewModel, type HistoryScope } from '@/view_models/useUsageHistoryViewModel';
import { ErrorState } from '@/widgets/common/ErrorState';
import { PageHeader } from '@/widgets/common/PageHeader';
import { UsageFilters } from '@/widgets/usage/UsageFilters';
import { UsagePagination } from '@/widgets/usage/UsagePagination';
import { UsageTable } from '@/widgets/usage/UsageTable';
import { OutcomeBadge } from '@/widgets/usage/OutcomeBadge';
import { Button } from '@/widgets/ui/Button';
import { Card } from '@/widgets/ui/Card';
import { Dialog } from '@/widgets/ui/Dialog';

function RecordDetails({ record }: { record: UsageRecord }) {
  const rows: [string, ReactNode][] = [
    ['Outcome', <OutcomeBadge key="o" outcome={record.outcome} />],
    ['Rejection', record.rejectionRule && record.rejectionLevel ? `${RULE_LABELS[record.rejectionRule]} (${record.rejectionRule}) · ${LEVEL_LABELS[record.rejectionLevel]}` : '—'],
    ['Units requested / consumed', `${formatUnits(record.unitsRequested)} / ${formatUnits(record.unitsConsumed)}`],
    ['Account', `${record.accountName} (${record.accountId})`],
    ['User', `${record.externalUserId} (${record.userId})`],
    ['Request id (idempotency key)', record.requestId],
    ['Idempotent replays', String(record.replayCount)],
    ['Account plan version', `${record.accountPlan.planName} v${record.accountPlan.version} (${record.accountPlan.planVersionId})`],
    ['User plan version', `${record.userPlan.planName} v${record.userPlan.version} (${record.userPlan.planVersionId})`],
    ['Period (UTC month)', record.period],
    ['Processed at', formatUtcDateTime(record.createdAt)],
    ['Correlation id', record.correlationId ?? '—'],
    ['Record id', record.id],
  ];
  return (
    <dl className="divide-y divide-slate-100 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 py-2 sm:grid-cols-[12rem_1fr]">
          <dt className="text-slate-500">{label}</dt>
          <dd className="break-all font-mono text-xs text-slate-800">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function UsageHistoryContent({ scope }: { scope: HistoryScope }) {
  const vm = useUsageHistoryViewModel(scope);
  const { list } = vm;
  return (
    <>
      <PageHeader
        title="Usage history"
        description={
          scope === 'operator'
            ? 'Every consume request across all accounts: outcome, the rule and level that rejected it, and the plan versions that decided it. Filter by account, user, outcome, rule, units, request id, replays and dates.'
            : 'Every consume request of your account: outcome, the rule and level that rejected it, and the plan versions that decided it. Click a row for all details.'
        }
      />
      <Card>
        <UsageFilters list={list} showAccountFilter={scope === 'operator'} totalItems={vm.history.data?.totalItems} isFetching={vm.history.isFetching} />
        {!list.isValid ? (
          <p role="alert" className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Fix the highlighted filter to see results.
          </p>
        ) : vm.history.error && !vm.history.data ? (
          <ErrorState className="m-4" error={vm.history.error} onRetry={() => void vm.history.refetch()} />
        ) : (
          <>
            <UsageTable
              records={vm.history.data?.items}
              isLoading={vm.history.isPending || vm.history.isFetching}
              onSelect={vm.select}
              hasFilters={list.activeCount > 0}
              showAccount={scope === 'operator'}
              sort={{ field: list.sort, order: list.order }}
              onSort={list.setSort}
              emptyAction={
                list.activeCount > 0 ? (
                  <Button variant="outline" size="sm" onClick={list.clearAll}>
                    Clear all filters
                  </Button>
                ) : undefined
              }
            />
            {vm.history.data && <UsagePagination page={vm.history.data} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} isFetching={vm.history.isFetching} />}
          </>
        )}
      </Card>
      <Dialog open={vm.selected !== null} onClose={() => vm.select(null)} title="Usage record" size="lg">
        {vm.selected && <RecordDetails record={vm.selected} />}
      </Dialog>
    </>
  );
}

export function OperatorUsageHistoryView() {
  return <UsageHistoryContent scope="operator" />;
}

export function AccountUsageHistoryView() {
  return <UsageHistoryContent scope="account" />;
}
