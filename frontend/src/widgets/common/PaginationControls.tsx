import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZE_OPTIONS } from '@/models/pagination';
import { formatUnits } from '@/utils/numberUtils';
import { Button } from '@/widgets/ui/Button';

interface PaginationControlsProps {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  isFetching?: boolean;
}

export function PaginationControls({
  page,
  pageSize,
  totalItems,
  totalPages,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
  onPageSizeChange,
  isFetching = false,
}: PaginationControlsProps) {
  const first = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
      <p aria-live="polite">
        {totalItems === 0 ? 'No results' : `Showing ${formatUnits(first)}–${formatUnits(last)} of ${formatUnits(totalItems)}`}
        {isFetching && <span className="ml-2 text-xs text-slate-400">Refreshing…</span>}
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Rows
            <select
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={!hasPreviousPage} aria-label="Previous page">
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <span className="min-w-20 text-center text-xs">
          Page {totalPages === 0 ? 0 : page} of {totalPages}
        </span>
        <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={!hasNextPage} aria-label="Next page">
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
