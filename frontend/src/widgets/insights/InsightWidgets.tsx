import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LEVEL_LABELS, RULE_LABELS } from '@/models/quota';
import type { RejectionBreakdownItem } from '@/models/usage-summary';
import type { MonthlyUsagePoint } from '@/contracts';
import { formatMonthLabel } from '@/utils/dateUtils';
import { cn } from '@/utils/formatUtils';
import { formatCompact, formatUnits } from '@/utils/numberUtils';
import { EmptyState } from '@/widgets/common/EmptyState';

const tones = {
  neutral: 'bg-slate-50 text-slate-900 [&_dt]:text-slate-500',
  success: 'bg-emerald-50 text-emerald-900 [&_dt]:text-emerald-700',
  danger: 'bg-rose-50 text-rose-900 [&_dt]:text-rose-700',
  warning: 'bg-amber-50 text-amber-900 [&_dt]:text-amber-700',
  brand: 'bg-brand-50 text-brand-900 [&_dt]:text-brand-700',
} as const;

/** One number in a grid of statistics. */
export function StatTile({ label, value, hint, tone = 'neutral' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: keyof typeof tones }) {
  return (
    <div className={cn('rounded-lg p-3', tones[tone])}>
      <dt className="text-xs">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-[11px] opacity-70">{hint}</dd>}
    </div>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', className)}>{children}</dl>;
}

/** "Why requests were rejected" chips; each opens the filtered history. */
export function RejectionChips({ items, linkFor }: { items: RejectionBreakdownItem[]; linkFor: (item: RejectionBreakdownItem) => string }) {
  if (items.length === 0) return <p className="text-xs text-slate-500">No rejected requests in this month.</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={`${item.rule}-${item.level}`}>
          <Link
            to={linkFor(item)}
            className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-800 ring-1 ring-rose-200 ring-inset hover:bg-rose-100"
          >
            {RULE_LABELS[item.rule]} · {LEVEL_LABELS[item.level]}: <strong>{item.count}</strong>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Units consumed (bars) and accepted / rejected requests (lines) for six months. */
export function MonthlyTrendChart({ data, height = 240 }: { data: MonthlyUsagePoint[]; height?: number }) {
  const hasData = data.some((point) => point.unitsConsumed > 0 || point.acceptedRequests > 0 || point.rejectedRequests > 0);
  if (!hasData) return <EmptyState title="No usage in the last six months" />;
  return (
    <div style={{ height }} role="img" aria-label="Monthly usage chart: units consumed, accepted and rejected requests over six months">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="period" tickFormatter={(value: string) => formatMonthLabel(value).split(' ')[0]!.slice(0, 3)} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="units" tickFormatter={(value: number) => formatCompact(value)} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="requests" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip labelFormatter={(label) => formatMonthLabel(String(label))} formatter={(value, name) => [formatUnits(Number(value)), name]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="units" dataKey="unitsConsumed" name="Units consumed" fill="#6366f1" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Line yAxisId="requests" dataKey="acceptedRequests" name="Accepted requests" stroke="#10b981" strokeWidth={2} type="monotone" isAnimationActive={false} />
          <Line yAxisId="requests" dataKey="rejectedRequests" name="Rejected requests" stroke="#e11d48" strokeWidth={2} type="monotone" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
