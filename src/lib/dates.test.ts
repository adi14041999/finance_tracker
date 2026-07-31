import { describe, it, expect } from 'vitest';
import {
  normaliseDate, normaliseMonth, addMonths, monthRange,
  monthOf, monthProgress, daysInMonth, isValidDate,
} from './dates';

describe('normaliseDate', () => {
  it('accepts the ISO form we ask the sheet for', () => {
    expect(normaliseDate('2026-07-14')).toBe('2026-07-14');
  });

  it('converts spreadsheet serial numbers', () => {
    // 45000 days after the 1899-12-30 epoch.
    expect(normaliseDate(45000)).toBe('2023-03-15');
    expect(normaliseDate(1)).toBe('1899-12-31');
  });

  it('converts US-style dates, in case the column gets reformatted', () => {
    expect(normaliseDate('7/4/2026')).toBe('2026-07-04');
    expect(normaliseDate('12/25/2025')).toBe('2025-12-25');
  });

  it('takes the date part of a timestamp', () => {
    expect(normaliseDate('2026-07-14T00:00:00.000Z')).toBe('2026-07-14');
  });

  it('rejects impossible dates rather than rolling them over', () => {
    // JS Date would happily turn Feb 30 into Mar 2. We refuse instead, so a
    // typo becomes a visible problem rather than a silently misfiled expense.
    expect(normaliseDate('2026-02-30')).toBeNull();
    expect(normaliseDate('2026-13-01')).toBeNull();
    expect(normaliseDate('not a date')).toBeNull();
    expect(normaliseDate('')).toBeNull();
  });

  it('knows February', () => {
    expect(isValidDate('2024-02-29')).toBe(true);  // leap
    expect(isValidDate('2026-02-29')).toBe(false); // not
    expect(daysInMonth(2000, 2)).toBe(29);         // divisible by 400
    expect(daysInMonth(1900, 2)).toBe(28);         // divisible by 100, not 400
  });
});

describe('normaliseMonth', () => {
  it('accepts YYYY-MM', () => {
    expect(normaliseMonth('2026-07')).toBe('2026-07');
  });

  it('falls back to the month of a full date', () => {
    expect(normaliseMonth('2026-07-31')).toBe('2026-07');
  });

  it('rejects nonsense', () => {
    expect(normaliseMonth('July')).toBeNull();
    expect(normaliseMonth('2026-99')).toBeNull();
  });
});

describe('month arithmetic', () => {
  it('adds and subtracts across year boundaries', () => {
    expect(addMonths('2026-07', 1)).toBe('2026-08');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-07', -12)).toBe('2025-07');
    expect(addMonths('2026-03', -14)).toBe('2025-01');
  });

  it('builds inclusive ranges', () => {
    expect(monthRange('2026-05', '2026-08')).toEqual(
      ['2026-05', '2026-06', '2026-07', '2026-08'],
    );
    expect(monthRange('2026-05', '2026-05')).toEqual(['2026-05']);
  });

  it('returns empty when the range runs backwards', () => {
    expect(monthRange('2026-08', '2026-05')).toEqual([]);
  });

  it('extracts the month from a date', () => {
    expect(monthOf('2026-07-14')).toBe('2026-07');
  });
});

describe('monthProgress', () => {
  it('reports how far through the current month we are', () => {
    // 15 of 31 days.
    expect(monthProgress('2026-07', '2026-07-15')).toBeCloseTo(15 / 31);
  });

  it('is 1 for months already finished', () => {
    expect(monthProgress('2026-06', '2026-07-15')).toBe(1);
  });

  it('is 0 for months not yet begun', () => {
    expect(monthProgress('2026-08', '2026-07-15')).toBe(0);
  });
});
