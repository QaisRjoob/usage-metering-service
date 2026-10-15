import type { ReactNode } from 'react';
import type { UsageRecord } from '@/models/usage-record';
import { LEVEL_LABELS, RULE_LABELS } from '@/models/quota';
import { formatUtcDateTime } from '@/utils/dateUtils';
import { formatUnits } from '@/utils/numberUtils';
import { useUsageHistoryViewModel } from '@/view_models/useUsageHistoryViewModel';
import { CredentialsGate } from '@/widgets/common/CredentialsGate';
import { ErrorState } from '@/widgets/common/ErrorState';
import { PageHeader } from '@/widgets/common/PageHeader';
import { UsageFilters } from '@/widgets/usage/UsageFilters';
import { UsagePagination } from '@/widgets/usage/UsagePagination';
import { UsageTable } from '@/widgets/usage/UsageTable';
import { OutcomeBadge } from '@/widgets/usage/OutcomeBadge';
import { Card } from '@/widgets/ui/Card';
import { Dialog } from '@/widgets/ui/Dialog';
import { cn } from '@/utils/formatUtils';

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

function UsageHistoryContent() {
  const vm = useUsageHistoryViewModel();
  const hasFilters = Object.values(vm.filters).some(Boolean);
  return (
    <>
      <PageHeader
        title="Usage history"
        description="Every consume request with its outcome, the rule and level that rejected it, and the plan versions that governed the decision. Newest first."
        actions={
          (vm.canUseAdmin || vm.canUseAccount) && (
            <div role="tablist" aria-label="History scope" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              {(['account', 'admin'] as const).map((scope) => (
                <button
                  key={scope}
                  role="tab"
                  type="button"
                  aria-selected={vm.scope === scope}
                  onClick={() => vm.setScope(scope)}
                  className={cn('rounded-md px-3 py-1.5 text-xs font-medium', vm.scope === scope ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100')}
                >
                  {scope === 'account' ? 'Connected account' : 'All accounts (operator)'}
                </button>
              ))}
            </div>
          )
        }
      />
      <CredentialsGate scope={vm.scope}>
        <Card>
          <UsageFilters key={JSON.stringify(vm.filters)} value={vm.filters} showAccountFilter={vm.scope === 'admin'} rangeError={vm.rangeError} onApply={vm.applyFilters} onClear={vm.clearFilters} />
          {vm.history.error && !vm.history.data ? (
            <ErrorState className="m-4" error={vm.history.error} onRetry={() => void vm.history.refetch()} />
          ) : (
            <>
              <UsageTable records={vm.history.data?.items} isLoading={vm.history.isPending || vm.history.isFetching} onSelect={vm.select} hasFilters={hasFilters} />
              {vm.history.data && <UsagePagination page={vm.history.data} onPageChange={vm.setPage} onPageSizeChange={vm.setPageSize} isFetching={vm.history.isFetching} />}
            </>
          )}
        </Card>
      </CredentialsGate>
      <Dialog open={vm.selected !== null} onClose={() => vm.select(null)} title="Usage record" size="lg">
        {vm.selected && <RecordDetails record={vm.selected} />}
      </Dialog>
    </>
  );
}

export default function UsageHistoryView() {
  return <UsageHistoryContent />;
}
