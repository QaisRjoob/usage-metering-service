import type { PaginatedResponse } from '@/models/pagination';
import { PaginationControls } from '@/widgets/common/PaginationControls';

/** Pagination for history: page-based, server-side, with a page-size selector. */
export function UsagePagination<T>({ page, onPageChange, onPageSizeChange, isFetching }: { page: PaginatedResponse<T>; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void; isFetching: boolean }) {
  return <PaginationControls {...page} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} isFetching={isFetching} />;
}
