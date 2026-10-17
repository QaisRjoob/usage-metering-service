import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AccountListItem } from '@/models/account';
import type { QuotaStatus } from '@/models/quota';
import { formatPercent } from '@/utils/numberUtils';
import { EmptyState } from '@/widgets/common/EmptyState';
import { useChartTheme } from '@/providers/themeContext';

const statusColor: Record<QuotaStatus, string> = {
  ok: '#10b981',
  warning: '#f59e0b',
  exhausted: '#e11d48',
  over_allowance: '#be123c',
};

/** Account-level utilization of the most-utilized accounts. Bars are capped visually at 120 %. */
export function QuotaUtilizationChart({ accounts, thresholdPercent, height = 280 }: { accounts: AccountListItem[]; thresholdPercent: number; height?: number }) {
  const chart = useChartTheme();
  if (accounts.length === 0) return <EmptyState title="No accounts yet" />;
  const data = accounts.map((account) => ({
    name: account.name,
    utilization: account.quota.utilizationPercent,
    display: Math.min(account.quota.utilizationPercent, 120),
    status: account.quota.status,
  }));
  return (
    <div style={{ height }} role="img" aria-label="Account quota utilization chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
          <XAxis type="number" domain={[0, 120]} tickFormatter={(value: number) => `${value}%`} tick={{ fontSize: 11, fill: chart.axis }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: chart.label }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(_value, _name, item) => [formatPercent((item.payload as { utilization: number }).utilization), 'Utilization']}
            contentStyle={chart.tooltip}
          />
          <ReferenceLine x={thresholdPercent} stroke="#f59e0b" strokeDasharray="4 4" />
          <ReferenceLine x={100} stroke="#e11d48" strokeDasharray="4 4" />
          <Bar dataKey="display" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={statusColor[entry.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
