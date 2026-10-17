import { z } from 'zod';

/** Largest number of units a single request may ask for, before any plan rule applies. */
export const MAX_UNITS_PER_REQUEST_INPUT = 1_000_000;
/** Largest monthly allowance a plan may define. Fits comfortably in a BIGINT and a JS number. */
export const MAX_MONTHLY_ALLOWANCE = 1_000_000_000_000;

/** UTC calendar month, e.g. "2026-10". */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected a UTC month formatted as YYYY-MM');
/** UTC calendar date, e.g. "2026-10-15". */
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a UTC date formatted as YYYY-MM-DD');

export const idSchema = z.uuid();

// ---------------------------------------------------------------- list-filter building blocks

/** Free-text search: trimmed, bounded, and an empty string counts as "no filter". */
export const searchSchema = (max = 100) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

/** Boolean query flag: accepts true/false from JSON and "true"/"false" from a query string. */
export const queryBooleanSchema = z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')]);

/** Utilization percentage bound (can exceed 100 when an allowance was reduced below usage). */
export const percentFilterSchema = z.coerce.number().min(0, 'Must be 0 or more').max(100_000);

/** Units bound for range filters. */
export const unitsFilterSchema = z.coerce.number().int('Must be a whole number').min(0, 'Must be 0 or more').max(MAX_UNITS_PER_REQUEST_INPUT);

/**
 * Refinement for range filters: for each [min, max] pair, when both are given, max must not be
 * below min. Works for numbers and for YYYY-MM-DD dates (compared as strings).
 */
export function rangeChecks<T extends object>(pairs: ReadonlyArray<readonly [keyof T & string, keyof T & string]>) {
  return (value: T, ctx: z.RefinementCtx) => {
    for (const [minKey, maxKey] of pairs) {
      const min = value[minKey] as unknown;
      const max = value[maxKey] as unknown;
      if (min !== undefined && max !== undefined && (max as number | string) < (min as number | string)) {
        ctx.addIssue({ code: 'custom', path: [maxKey], message: `${maxKey} must be greater than or equal to ${minKey}` });
      }
    }
  };
}

/** Units are positive whole numbers. Strings, decimals, zero and negatives are rejected. */
export const unitsSchema = z
  .number({ error: 'units must be a number' })
  .int('units must be a whole number')
  .min(1, 'units must be at least 1')
  .max(MAX_UNITS_PER_REQUEST_INPUT, `units must be at most ${MAX_UNITS_PER_REQUEST_INPUT}`);

/** Caller-chosen user identifier, unique within an account. */
export const externalUserIdSchema = z
  .string()
  .trim()
  .min(1, 'userId is required')
  .max(128)
  .regex(/^[A-Za-z0-9._@:+-]+$/, 'userId may contain letters, digits and . _ @ : + -');

/** Caller-chosen idempotency key for a consume request. */
export const requestIdSchema = z
  .string()
  .trim()
  .min(1, 'requestId is required')
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'requestId may contain letters, digits and . _ : -');

export type UtcMonth = string;

/** active = at least one consume request in the selected month. */
export const ACTIVITY_FILTERS = ['active', 'inactive'] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];
