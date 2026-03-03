import { describe, expect, it } from 'vitest';
import { isDateRangeValid, resolveDateRange } from './date-range.js';

describe('date-range utils', () => {
  it('builds a range with provided from/to values', () => {
    const range = resolveDateRange('2026-01-01T00:00:00.000Z', '2026-01-15T00:00:00.000Z', 90);

    expect(range.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('applies default lookback when from is missing', () => {
    const range = resolveDateRange(undefined, '2026-01-15T00:00:00.000Z', 30);
    const expectedFrom = new Date('2025-12-16T00:00:00.000Z');

    expect(range.from.toISOString()).toBe(expectedFrom.toISOString());
  });

  it('validates chronological ordering', () => {
    const valid = resolveDateRange('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 7);
    const invalid = resolveDateRange('2026-01-03T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 7);

    expect(isDateRangeValid(valid)).toBe(true);
    expect(isDateRangeValid(invalid)).toBe(false);
  });
});
