import type { QuotaStatus } from '@/models/quota';
import { cn } from '@/utils/formatUtils';
import { clampPercent, formatPercent, isFiniteNumber } from '@/utils/numberUtils';

const barColor: Record<QuotaStatus, string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  exhausted: 'bg-rose-500',
  over_allowance: 'bg-rose-600',
};

/**
 * The bar width is clamped to 0-100 %, while the label shows the real utilization (which can be
 * above 100 % after an allowance reduction). Missing data renders an empty, labelled bar.
 */
export function QuotaProgressBar({ utilizationPercent, status, label, className }: { utilizationPercent: number | null | undefined; status: QuotaStatus | null | undefined; label: string; className?: string }) {
  const valid = isFiniteNumber(utilizationPercent);
  const width = clampPercent(utilizationPercent);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={valid ? Math.round(width) : undefined}
        aria-valuetext={valid ? formatPercent(utilizationPercent) : 'No data'}
      >
        <div className={cn('h-full rounded-full transition-[width]', status ? barColor[status] : 'bg-slate-300')} style={{ width: `${width}%` }} />
      </div>
      <span className="w-14 text-right text-xs tabular-nums text-slate-600">{formatPercent(utilizationPercent)}</span>
    </div>
  );
}
