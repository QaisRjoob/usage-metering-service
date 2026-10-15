/**
 * A quota period is a UTC calendar month, written "YYYY-MM". In PostgreSQL it is stored as the
 * first day of the month (DATE). A new month simply means new counter rows - no reset job.
 */
export type QuotaPeriod = string;

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** The period a request processed at `date` belongs to (server time, never client time). */
export function periodOf(date: Date): QuotaPeriod {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

/** "2026-10" -> "2026-10-01" (the DATE stored in the database). */
export function periodToDate(period: QuotaPeriod): string {
  return `${period}-01`;
}

/** "2026-10-01" -> "2026-10". */
export function periodFromDate(date: string): QuotaPeriod {
  return date.slice(0, 7);
}

export function addPeriods(period: QuotaPeriod, delta: number): QuotaPeriod {
  const [year, month] = period.split('-').map(Number) as [number, number];
  return periodOf(new Date(Date.UTC(year, month - 1 + delta, 1)));
}

export function daysInPeriod(period: QuotaPeriod): number {
  const [year, month] = period.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
