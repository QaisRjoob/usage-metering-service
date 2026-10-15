import { describe, expect, it } from 'vitest';
import { addMonths, daysInMonth, isValidIsoDate, isValidMonth, monthKeyOf } from './dateUtils';
import { clampPercent, formatPercent, formatUnits } from './numberUtils';
import { validateWith } from './validationUtils';
import { consumeRequestSchema } from '@/models/consumption';

describe('dateUtils (UTC)', () => {
  it('derives the UTC month regardless of local time', () => {
    expect(monthKeyOf(new Date('2026-10-31T23:30:00.000Z'))).toBe('2026-10');
    expect(monthKeyOf(new Date('2026-11-01T00:00:00.000Z'))).toBe('2026-11');
  });
  it('adds months across year boundaries', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
  it('validates months and dates', () => {
    expect(isValidMonth('2026-10')).toBe(true);
    expect(isValidMonth('2026-13')).toBe(false);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(daysInMonth('2028-02')).toBe(29);
  });
});

describe('numberUtils', () => {
  it('never shows misleading values for missing data', () => {
    expect(formatUnits(undefined)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
    expect(clampPercent(undefined)).toBe(0);
  });
  it('shows real utilization above 100 % but clamps bar width', () => {
    expect(formatPercent(133.3)).toBe('133.3%');
    expect(clampPercent(133.3)).toBe(100);
    expect(formatUnits(10000)).toBe('10,000');
  });
});

describe('consume request validation (shared contract)', () => {
  it.each([
    [{ userId: 'alice', units: 0, requestId: 'r' }, 'units'],
    [{ userId: 'alice', units: -3, requestId: 'r' }, 'units'],
    [{ userId: 'alice', units: 2.5, requestId: 'r' }, 'units'],
    [{ userId: 'alice', units: '10', requestId: 'r' }, 'units'],
    [{ userId: 'alice', units: 10, requestId: '' }, 'requestId'],
    [{ userId: '', units: 10, requestId: 'r' }, 'userId'],
  ])('rejects %j', (input, field) => {
    const result = validateWith(consumeRequestSchema, input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[field]).toBeDefined();
  });
  it('accepts a valid request', () => {
    expect(validateWith(consumeRequestSchema, { userId: 'alice', units: 10, requestId: 'req_1' }).success).toBe(true);
  });
});
