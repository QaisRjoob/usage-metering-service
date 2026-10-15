import { AlertTriangle, Building2, Gauge, Layers } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AdminAnalyticsSummary } from '@/models/usage-summary';
import { formatPercent, formatUnits } from '@/utils/numberUtils';
import { QuotaProgressBar } from '@/widgets/quotas/QuotaProgressBar';
import { Card } from '@/widgets/ui/Card';

function StatCard({ label, value, icon, footer }: { label: string; value: string; icon: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <span className="text-slate-400">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {footer && <div className="mt-2 text-xs text-slate-500">{footer}</div>}
    </Card>
  );
}

export function UsageSummaryCards({ summary }: { summary: AdminAnalyticsSummary }) {
  const { totals } = summary;
  const utilizationStatus = totals.utilizationPercent >= 100 ? 'exhausted' : totals.utilizationPercent >= summary.thresholdPercent ? 'warning' : 'ok';
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Units consumed"
        value={formatUnits(totals.unitsConsumed)}
        icon={<Gauge className="size-4" aria-hidden="true" />}
        footer={`${formatUnits(totals.acceptedRequests)} accepted · ${formatUnits(totals.rejectedRequests)} rejected requests`}
      />
      <StatCard
        label="Allocated (account plans)"
        value={formatUnits(totals.totalAllowance)}
        icon={<Layers className="size-4" aria-hidden="true" />}
        footer={`${formatUnits(totals.totalRemaining)} units remaining across accounts`}
      />
      <StatCard
        label="Overall utilization"
        value={formatPercent(totals.utilizationPercent)}
        icon={<Building2 className="size-4" aria-hidden="true" />}
        footer={<QuotaProgressBar utilizationPercent={totals.utilizationPercent} status={utilizationStatus} label="Overall utilization" />}
      />
      <StatCard
        label={`Accounts ≥ ${summary.thresholdPercent}%`}
        value={formatUnits(totals.accountsApproachingLimit + totals.accountsAtOrOverLimit)}
        icon={<AlertTriangle className="size-4" aria-hidden="true" />}
        footer={`${totals.accountsApproachingLimit} approaching · ${totals.accountsAtOrOverLimit} at or over limit · ${totals.accounts} accounts total`}
      />
    </div>
  );
}
