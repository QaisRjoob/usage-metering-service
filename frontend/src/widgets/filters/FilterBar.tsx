import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/utils/formatUtils';
import { formatUnits } from '@/utils/numberUtils';
import { Button } from '@/widgets/ui/Button';
import { Input } from '@/widgets/ui/Field';

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface FilterBarProps {
  /** Free-text search (debounced). */
  search?: { value: string; onChange: (value: string) => void; placeholder: string; label: string };
  /** One-click presets, e.g. a SegmentedFilter. */
  quick?: ReactNode;
  /** Extra fields shown under "More filters". */
  advanced?: ReactNode;
  /** How many of the advanced fields are set (shown on the toggle, opens the panel by default). */
  advancedActiveCount?: number;
  chips: FilterChip[];
  onClearAll: () => void;
  totalItems?: number;
  isFetching?: boolean;
  /** Right-aligned controls such as a sort selector. */
  trailing?: ReactNode;
}

/**
 * Standard filter area for every list: search, quick filters, an expandable "More filters"
 * panel, removable chips for every active filter and "Clear all". All filters run on the server.
 */
export function FilterBar({ search, quick, advanced, advancedActiveCount = 0, chips, onClearAll, totalItems, isFetching = false, trailing }: FilterBarProps) {
  const [open, setOpen] = useState(advancedActiveCount > 0);
  const panelId = useId();
  return (
    <div className="space-y-3 border-b border-slate-100 p-4">
      <div className="flex flex-wrap items-center gap-3">
        {search && <SearchInput {...search} />}
        {quick}
        {advanced && (
          <Button variant={open ? 'secondary' : 'outline'} size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={panelId}>
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            More filters
            {advancedActiveCount > 0 && <span className="rounded-full bg-solid-brand px-1.5 text-[10px] text-white">{advancedActiveCount}</span>}
            <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
          </Button>
        )}
        {trailing && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
      </div>
      {advanced && open && (
        <div id={panelId} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {advanced}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
        <span className="text-slate-500">
          {totalItems === undefined ? 'Loading…' : `${formatUnits(totalItems)} result${totalItems === 1 ? '' : 's'}`}
          {isFetching && totalItems !== undefined && ' · updating…'}
        </span>
        {chips.map((chip) => (
          <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-brand-800 ring-1 ring-inset ring-brand-100">
            {chip.label}
            <button type="button" onClick={chip.onRemove} className="rounded-full p-0.5 hover:bg-brand-100" aria-label={`Remove filter ${chip.label}`}>
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        {chips.length > 0 && (
          <button type="button" onClick={onClearAll} className="font-medium text-brand-700 hover:underline">
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

/** Text input that only commits after typing pauses, so each keystroke is not a request. */
export function SearchInput({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  const [draft, setDraft] = useState(value);
  const debounced = useDebouncedValue(draft, 350);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (debounced.trim() !== value) onChange(debounced.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  return (
    <label className="relative min-w-56 flex-1">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <Input className="h-9 pl-9" placeholder={placeholder} value={draft} onChange={(event) => setDraft(event.target.value)} />
    </label>
  );
}
