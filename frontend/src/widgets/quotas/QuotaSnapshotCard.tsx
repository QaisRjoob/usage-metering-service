import { Building2, User } from 'lucide-react';
import type { QuotaSnapshot } from '@/models/quota';
import { formatMonthLabel } from '@/utils/dateUtils';
import { cn } from '@/utils/formatUtils';
import { formatUnits } from '@/utils/numberUtils';
import { QuotaProgressBar } from './QuotaProgressBar';
import { QuotaStatusBadge } from './QuotaStatusBadge';

/** Limit, consumed, remaining and utilization for one level (account or user). */
export function QuotaSnapshotCard({ quota, title, className, highlight = false }: { quota: QuotaSnapshot; title?: string; className?: string; highlight?: boolean }) {
  const Icon = quota.level === 'account' ? Building2 : User;
  return (
    <div className={cn('rounded-xl border bg-white p-4', highlight ? 'border-rose-300 ring-2 ring-rose-100' : 'border-slate-200', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{title ?? (quota.level === 'account' ? 'Account (shared)' : 'User (individual)')}</p>
            <p className="truncate text-xs text-slate-500">
              {quota.planName} · v{quota.planVersion} · {formatMonthLabel(quota.period)}
            </p>
          </div>
        </div>
        <QuotaStatusBadge status={quota.status} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">Consumed</dt>
          <dd className="text-sm font-semibold tabular-nums">{formatUnits(quota.consumed)}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">Remaining</dt>
          <dd className={cn('text-sm font-semibold tabular-nums', quota.remaining === 0 && 'text-rose-600')}>{formatUnits(quota.remaining)}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">Monthly</dt>
          <dd className="text-sm font-semibold tabular-nums">{formatUnits(quota.monthlyAllowance)}</dd>
        </div>
      </dl>
      <QuotaProgressBar className="mt-3" utilizationPercent={quota.utilizationPercent} status={quota.status} label={`${quota.level} quota utilization`} />
      <p className="mt-2 text-xs text-slate-500">Max {formatUnits(quota.maxUnitsPerRequest)} units per request</p>
      {quota.status === 'over_allowance' && (
        <p className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700">
          The allowance was reduced below existing usage. Remaining shows 0 and new requests are rejected at this level until the allowance increases or a new month starts.
        </p>
      )}
    </div>
  );
}
