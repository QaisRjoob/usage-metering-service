import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * URL-backed state for shareable filters and pagination. Setting any key other than `page`
 * resets `page`, because a materially different filter makes the old page number meaningless.
 * Never put credentials in here.
 */
export function useSearchParamState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const get = useCallback((key: string): string | undefined => searchParams.get(key) ?? undefined, [searchParams]);

  const getNumber = useCallback(
    (key: string, fallback: number): number => {
      const parsed = Number(searchParams.get(key));
      return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
    },
    [searchParams],
  );

  const set = useCallback(
    (updates: Record<string, string | number | null | undefined>) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === undefined || value === '') next.delete(key);
            else next.set(key, String(value));
          }
          if (!('page' in updates)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { get, getNumber, set };
}
