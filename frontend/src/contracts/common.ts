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
