import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/utils/formatUtils';
import { TableSkeleton } from './LoadingSkeleton';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide on narrow screens to keep the table readable on phones. */
  hideBelow?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'right';
  /** Server-side sort key; makes the header a sort button. */
  sortKey?: string;
  /** Order used the first time this column is clicked (default 'desc'). */
  firstOrder?: 'asc' | 'desc';
}

interface DataTableProps<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowKey: (row: T) => string;
  isLoading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Current server-side sort. */
  sort?: { field?: string; order?: 'asc' | 'desc' };
  onSort?: (field: string, firstOrder: 'asc' | 'desc') => void;
}

const hideClass = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const;

export function DataTable<T>({ caption, columns, rows, getRowKey, isLoading = false, empty, onRowClick, sort, onSort }: DataTableProps<T>) {
  if (isLoading && !rows) return <TableSkeleton columns={Math.min(columns.length, 6)} />;
  if (rows && rows.length === 0) return <>{empty}</>;
  return (
    // `relative` keeps absolutely positioned children (e.g. sr-only headers) inside the scroll area.
    <div className="relative overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={column.sortKey && sort?.field === column.sortKey ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}
                className={cn('whitespace-nowrap px-4 py-2.5', column.hideBelow && hideClass[column.hideBelow], column.align === 'right' && 'text-right', column.className)}
              >
                {column.sortKey && onSort ? (
                  <SortButton active={sort?.field === column.sortKey} order={sort?.order} onClick={() => onSort(column.sortKey!, column.firstOrder ?? 'desc')}>
                    {column.header}
                  </SortButton>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={cn('divide-y divide-slate-100', isLoading && 'opacity-60')}>
          {rows?.map((row) => (
            <tr
              key={getRowKey(row)}
              className={cn('align-middle', onRowClick && 'cursor-pointer hover:bg-slate-50')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn('px-4 py-3 text-slate-700', column.hideBelow && hideClass[column.hideBelow], column.align === 'right' && 'text-right tabular-nums', column.className)}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortButton({ active, order, onClick, children }: { active: boolean; order?: 'asc' | 'desc'; onClick: () => void; children: ReactNode }) {
  const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('inline-flex items-center gap-1 rounded px-1 -mx-1 uppercase tracking-wide hover:bg-slate-200/70 hover:text-slate-800', active && 'text-brand-700')}
    >
      {children}
      <Icon className="size-3.5" aria-hidden="true" />
      {/* The column name comes first; the state follows for screen readers. */}
      <span className="sr-only">{active ? `, sorted ${order === 'asc' ? 'ascending' : 'descending'}, click to reverse` : ', click to sort'}</span>
    </button>
  );
}
