import { useId } from 'react';
import { formatMonthLabel, recentMonths } from '@/utils/dateUtils';
import { cn } from '@/utils/formatUtils';

/** Picks a UTC month among the last 12. Months are labelled in UTC to avoid time-zone surprises. */
export function MonthSelect({ value, onChange, className, label = 'Month (UTC)' }: { value: string; onChange: (month: string) => void; className?: string; label?: string }) {
  const id = useId();
  const months = recentMonths(12);
  if (!months.includes(value)) months.push(value);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <label htmlFor={id} className="whitespace-nowrap text-xs font-medium text-slate-600">
        {label}
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm shadow-sm">
        {months.map((month) => (
          <option key={month} value={month}>
            {formatMonthLabel(month)}
          </option>
        ))}
      </select>
    </div>
  );
}
