import { useId, type ReactNode } from 'react';
import { cn } from '@/utils/formatUtils';
import { Input, Select } from '@/widgets/ui/Field';

/** One-click preset buttons ("All / Accepted / Rejected"). Keyboard accessible radio group. */
export function SegmentedFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | '';
  options: { value: T | ''; label: string }[];
  onChange: (value: T | '') => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-surface p-0.5">
      {options.map((option) => (
        <button
          key={option.value || 'all'}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn('rounded-md px-3 py-1.5 text-xs font-medium', value === option.value ? 'bg-solid-brand text-white' : 'text-slate-600 hover:bg-slate-100')}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FilterLabel({ id, label, error, children, className }: { id: string; label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <label htmlFor={id} className="block text-xs font-medium text-slate-600">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectFilter({
  label,
  value,
  onChange,
  options,
  allLabel = 'Any',
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <FilterLabel id={id} label={label} error={error}>
      <Select id={id} className="h-9" value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </FilterLabel>
  );
}

export function TextFilter({ label, value, onChange, placeholder, error }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; error?: string }) {
  const id = useId();
  return (
    <FilterLabel id={id} label={label} error={error}>
      <Input id={id} className="h-9" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} />
    </FilterLabel>
  );
}

/** Min/max pair. The shared query schema reports "max must be >= min" on the max field. */
export function RangeFilter({
  label,
  min,
  max,
  onChange,
  unit,
  error,
}: {
  label: string;
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
  unit?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <FilterLabel id={`${id}-min`} label={unit ? `${label} (${unit})` : label} error={error}>
      <div className="flex items-center gap-2">
        <Input id={`${id}-min`} className="h-9 min-w-0 flex-1" type="number" min={0} inputMode="numeric" placeholder="Min" value={min} onChange={(event) => onChange(event.target.value, max)} aria-label={`${label} minimum`} aria-invalid={Boolean(error)} />
        <span className="text-slate-400" aria-hidden="true">
          –
        </span>
        <Input className="h-9 min-w-0 flex-1" type="number" min={0} inputMode="numeric" placeholder="Max" value={max} onChange={(event) => onChange(min, event.target.value)} aria-label={`${label} maximum`} aria-invalid={Boolean(error)} />
      </div>
    </FilterLabel>
  );
}

export function DateRangeFilter({ label, from, to, onChange, error }: { label: string; from: string; to: string; onChange: (from: string, to: string) => void; error?: string }) {
  const id = useId();
  return (
    <FilterLabel id={`${id}-from`} label={`${label} (UTC)`} error={error} className="sm:col-span-2">
      <div className="flex items-center gap-2">
        <Input id={`${id}-from`} className="h-9 min-w-0 flex-1" type="date" value={from} onChange={(event) => onChange(event.target.value, to)} aria-label={`${label} from`} aria-invalid={Boolean(error)} />
        <span className="text-slate-400" aria-hidden="true">
          –
        </span>
        <Input className="h-9 min-w-0 flex-1" type="date" value={to} onChange={(event) => onChange(from, event.target.value)} aria-label={`${label} to`} aria-invalid={Boolean(error)} />
      </div>
    </FilterLabel>
  );
}
