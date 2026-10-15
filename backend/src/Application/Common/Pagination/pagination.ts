import { buildPage, type PaginatedResponse } from '../../../contracts';

export interface PageWindow {
  offset: number;
  limit: number;
}

export function pageWindow(page: number, pageSize: number): PageWindow {
  return { offset: (page - 1) * pageSize, limit: pageSize };
}

/** Builds the page envelope from one page of rows and the total count (separate COUNT query). */
export function toPage<TRow, TItem>(rows: TRow[], total: number, page: number, pageSize: number, map: (row: TRow) => TItem): PaginatedResponse<TItem> {
  return buildPage(rows.map(map), page, pageSize, total);
}
