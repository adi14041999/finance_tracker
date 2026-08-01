import { describe, it, expect } from 'vitest';
import { rangeMonths, rangeStart, RANGES } from './range';

const EARLIEST = '2025-01';

describe('rangeMonths', () => {
  it('year to date runs from January to the end month', () => {
    const months = rangeMonths('ytd', '2026-07', EARLIEST);
    expect(months[0]).toBe('2026-01');
    expect(months[months.length - 1]).toBe('2026-07');
    expect(months).toHaveLength(7);
  });

  it('twelve months means twelve points, not thirteen', () => {
    const months = rangeMonths('12m', '2026-07', EARLIEST);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-08');
  });

  it('all time starts where the data starts', () => {
    expect(rangeMonths('all', '2026-07', EARLIEST)[0]).toBe('2025-01');
    expect(rangeMonths('all', '2026-07', EARLIEST)).toHaveLength(19);
  });

  it('clamps a long range to the history that exists', () => {
    // Five years of nineteen-month data is nineteen months. Drawing forty-one
    // months of zero would read as "nothing happened", not "wasn't tracking".
    expect(rangeMonths('5y', '2026-07', EARLIEST)).toHaveLength(19);
    expect(rangeMonths('3y', '2026-07', EARLIEST)).toHaveLength(19);
  });

  it('does not clamp when the history is long enough', () => {
    expect(rangeMonths('3y', '2026-07', '2000-01')).toHaveLength(36);
    expect(rangeMonths('5y', '2026-07', '2000-01')).toHaveLength(60);
  });

  it('handles year to date in January', () => {
    expect(rangeMonths('ytd', '2026-01', EARLIEST)).toEqual(['2026-01']);
  });

  it('clamps year to date when the data starts mid-year', () => {
    expect(rangeMonths('ytd', '2026-07', '2026-04')).toEqual(
      ['2026-04', '2026-05', '2026-06', '2026-07'],
    );
  });

  it('never returns an empty range', () => {
    for (const r of RANGES) {
      expect(rangeMonths(r.key, '2026-07', null).length).toBeGreaterThan(0);
      expect(rangeMonths(r.key, '2025-01', '2026-01').length).toBeGreaterThan(0);
    }
  });

  it('returns consecutive months with no gaps', () => {
    const months = rangeMonths('all', '2026-07', EARLIEST);
    for (let i = 1; i < months.length; i++) {
      expect(months[i] > months[i - 1]).toBe(true);
    }
  });
});

describe('rangeStart', () => {
  it('is the first month of the range', () => {
    expect(rangeStart('ytd', '2026-07', EARLIEST)).toBe('2026-01');
    expect(rangeStart('all', '2026-07', EARLIEST)).toBe('2025-01');
  });
});
