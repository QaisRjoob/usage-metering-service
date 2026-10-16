import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { ZodType } from 'zod';
import type { SortOrder } from '@/models/pagination';

export interface ListQueryDefaults {
  pageSize?: number;
  sort?: string;
  order?: SortOrder;
}

/**
 * URL-backed state for a server-side list: filters, sort, order, page and page size.
 *
 * - `filters` are the raw strings from the URL (what the inputs show).
 * - `query` is the same data parsed by the shared query DTO schema (the one the API validates
 *   with), or null when it is invalid - then `errors` says which field is wrong and the list
 *   should not be requested.
 * - Changing a filter resets the page to 1; sorting toggles asc/desc on the same field.
 */
export function useListQuery<TQuery>(schema: ZodType<TQuery>, fields: readonly string[], defaults: ListQueryDefaults = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => {
    const values: Record<string, string> = {};
    for (const field of fields) {
      const value = searchParams.get(field);
      if (value !== null && value !== '') values[field] = value;
    }
    return values;
  }, [searchParams, fields]);

  const page = Number(searchParams.get('page')) || 1;
  const pageSize = Number(searchParams.get('pageSize')) || defaults.pageSize || 20;
  const sort = searchParams.get('sort') ?? defaults.sort;
  const order = (searchParams.get('order') as SortOrder | null) ?? defaults.order;

  const { query, errors } = useMemo(() => {
    const input: Record<string, unknown> = { ...filters, page, pageSize };
    if (sort) input.sort = sort;
    if (order) input.order = order;
    const parsed = schema.safeParse(input);
    if (parsed.success) return { query: parsed.data, errors: {} as Record<string, string> };
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '_form');
      fieldErrors[key] ??= issue.message;
    }
    return { query: null, errors: fieldErrors };
  }, [schema, filters, page, pageSize, sort, order]);

  const update = useCallback(
    (updates: Record<string, string | number | null | undefined>, keepPage = false) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === undefined || value === '') next.delete(key);
            else next.set(key, String(value));
          }
          if (!keepPage) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return {
    filters,
    query,
    errors,
    isValid: query !== null,
    page,
    pageSize,
    sort,
    order,
    activeCount: Object.keys(filters).length,
    /** Set one or more filters (page resets to 1). */
    set: update,
    clear: (field: string) => update({ [field]: null }),
    clearAll: () => update(Object.fromEntries(fields.map((field) => [field, null]))),
    setPage: (next: number) => update({ page: next }, true),
    setPageSize: (next: number) => update({ pageSize: next }),
    /** Click on a column: same field toggles the order, a new field starts with `firstOrder`. */
    setSort: (field: string, firstOrder: SortOrder = 'desc') => {
      const nextOrder = sort === field ? (order === 'asc' ? 'desc' : 'asc') : firstOrder;
      update({ sort: field, order: nextOrder });
    },
  };
}

export type ListQueryState<TQuery> = ReturnType<typeof useListQuery<TQuery>>;
