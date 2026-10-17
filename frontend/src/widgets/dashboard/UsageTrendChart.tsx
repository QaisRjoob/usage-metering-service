import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DailyUsagePoint } from '@/models/usage-summary';
import { formatShortDate } from '@/utils/dateUtils';
import { formatCompact, formatUnits } from '@/utils/numberUtils';
import { EmptyState } from '@/widgets/common/EmptyState';
import { useChartTheme } from '@/providers/themeContext';

/** Daily units consumed (bars) and rejected requests (line), per UTC day. */
export function UsageTrendChart({ data, height = 280 }: { data: DailyUsagePoint[]; height?: number }) {
  const chart = useChartTheme();
  const hasData = data.some((point) => point.unitsConsumed > 0 || point.rejectedRequests > 0);
  if (!hasData) return <EmptyState title="No usage in this period" description="Accepted and rejected requests will appear here." />;
  return (
    <div style={{ height }} role="img" aria-label="Daily usage chart: units consumed per day and rejected requests per day">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: chart.axis }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis yAxisId="units" tickFormatter={(value: number) => formatCompact(value)} tick={{ fontSize: 11, fill: chart.axis }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="requests" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: chart.axis }} tickLine={false} axisLine={false} />
          <Tooltip
            labelFormatter={(label) => `${formatShortDate(String(label))} (UTC)`}
            formatter={(value, name) => [formatUnits(Number(value)), name]}
            contentStyle={chart.tooltip}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="units" dataKey="unitsConsumed" name="Units consumed" fill="#6366f1" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Line yAxisId="requests" dataKey="rejectedRequests" name="Rejected requests" stroke="#e11d48" strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
