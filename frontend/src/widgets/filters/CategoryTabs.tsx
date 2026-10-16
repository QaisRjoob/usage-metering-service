import type { ReactNode } from 'react';
import { cn } from '@/utils/formatUtils';
import { formatUnits } from '@/utils/numberUtils';

export interface CategoryOption {
  value: string;
  label: string;
  /** Items in this category (from the facets endpoint); hidden while unknown. */
  count?: number;
}

/**
 * Category tabs with counts ("All 12 · Active 7 · Inactive 5"). One option is selected; '' means all.
 * A keyboard-accessible radio group, like SegmentedFilter, with the server-side count on each tab.
 */
export function CategoryTabs({ label, value, options, onChange }: { label: string; value: string; options: CategoryOption[]; onChange: (value: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value || 'all'}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            <span className="max-w-48 truncate">{option.label}</span>
            {option.count !== undefined && (
              <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', selected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>{formatUnits(option.count)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A titled row of category tabs; several groups make the "Browse by category" panel. */
export function CategoryGroup({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  );
}

export function CategoryPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-slate-100 px-4 pt-4 pb-3">{children}</div>;
}
