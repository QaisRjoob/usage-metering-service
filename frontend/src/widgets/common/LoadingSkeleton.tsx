import { cn } from '@/utils/formatUtils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/80', className)} aria-hidden="true" />;
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-xl border border-slate-200 bg-white p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-32" />
          <Skeleton className="mt-3 h-2 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div role="status" aria-label="Loading chart" className="flex items-end gap-2 px-2" style={{ height }}>
      {Array.from({ length: 14 }, (_, index) => (
        <Skeleton key={index} className="flex-1" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="Loading table" className="divide-y divide-slate-100">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-4 px-4 py-3">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading page">
      <Skeleton className="h-8 w-56" />
      <CardsSkeleton />
      <div className="rounded-xl border border-slate-200 bg-white">
        <TableSkeleton />
      </div>
    </div>
  );
}
