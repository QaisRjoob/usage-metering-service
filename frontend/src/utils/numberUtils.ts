const integerFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Formats a whole number of units; shows an em dash for missing or invalid values. */
export function formatUnits(value: number | null | undefined): string {
  return isFiniteNumber(value) ? integerFormatter.format(value) : '—';
}

export function formatCompact(value: number | null | undefined): string {
  return isFiniteNumber(value) ? compactFormatter.format(value) : '—';
}

/**
 * Formats a utilization percentage. The underlying value can exceed 100 when an allowance was
 * reduced below usage; it is shown as-is so the overage is visible.
 */
export function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (!isFiniteNumber(value)) return '—';
  return `${value.toFixed(fractionDigits).replace(/\.0+$/, '')}%`;
}

/** Width for a progress bar: always within [0, 100] even when utilization is higher. */
export function clampPercent(value: number | null | undefined): number {
  if (!isFiniteNumber(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
