/**
 * All quota periods are UTC calendar months ("YYYY-MM"). Every helper here works in UTC so the
 * browser's local time zone never changes which month a value belongs to.
 */

const pad2 = (value: number): string => String(value).padStart(2, '0');

export function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

export function currentUtcMonth(now: Date = new Date()): string {
  return monthKeyOf(now);
}

export function isoDateOf(date: Date): string {
  return `${monthKeyOf(date)}-${pad2(date.getUTCDate())}`;
}

export function parseMonth(month: string): { year: number; monthIndex: number } {
  const [yearText, monthText] = month.split('-');
  return { year: Number(yearText), monthIndex: Number(monthText) - 1 };
}

export function isValidMonth(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isValidIsoDate(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && isoDateOf(parsed) === value;
}

export function addMonths(month: string, delta: number): string {
  const { year, monthIndex } = parseMonth(month);
  return monthKeyOf(new Date(Date.UTC(year, monthIndex + delta, 1)));
}

export function monthStart(month: string): Date {
  const { year, monthIndex } = parseMonth(month);
  return new Date(Date.UTC(year, monthIndex, 1));
}

export function daysInMonth(month: string): number {
  const { year, monthIndex } = parseMonth(month);
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** The last `count` months ending with `endMonth`, newest first. */
export function recentMonths(count: number, endMonth: string = currentUtcMonth()): string[] {
  return Array.from({ length: count }, (_, index) => addMonths(endMonth, -index));
}

export function formatMonthLabel(month: string): string {
  if (!isValidMonth(month)) return month;
  return monthStart(month).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function formatShortDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** e.g. "Oct 15, 2026, 14:03:22 UTC". */
export function formatUtcDateTime(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return 'Invalid date';
  const datePart = parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const timePart = parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });
  return `${datePart}, ${timePart} UTC`;
}
