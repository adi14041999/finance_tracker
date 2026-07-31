import { describe, it, expect } from 'vitest';
import { toCents, formatMoney, formatMoneyCompact, pctChange, sum } from './money';

describe('toCents', () => {
  it('converts plain numbers', () => {
    expect(toCents(86.42)).toBe(8642);
    expect(toCents(0)).toBe(0);
    expect(toCents(2400)).toBe(240000);
  });

  it('handles negatives, which are refunds', () => {
    expect(toCents(-89)).toBe(-8900);
  });

  it('strips currency formatting the sheet might send', () => {
    expect(toCents('$1,204.88')).toBe(120488);
    expect(toCents('  42.50 ')).toBe(4250);
  });

  it('reads accounting-style parentheses as negative', () => {
    expect(toCents('(45.00)')).toBe(-4500);
  });

  it('returns null for blanks and nonsense rather than zero', () => {
    // This distinction matters: a blank cell is missing data (a problem to
    // report), while zero is a real value. Collapsing them hides mistakes.
    expect(toCents('')).toBeNull();
    expect(toCents(null)).toBeNull();
    expect(toCents(undefined)).toBeNull();
    expect(toCents('n/a')).toBeNull();
  });

  it('rounds a half cent up, despite binary float', () => {
    // 8.075 * 100 evaluates to 807.4999999999999, so the obvious
    // Math.round(n * 100) yields 807 and quietly loses a cent.
    expect(toCents(8.075)).toBe(808);
    expect(toCents(0.615)).toBe(62);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(-8.075)).toBe(-808);
  });

  it('leaves ordinary two-decimal values exactly alone', () => {
    expect(toCents(0.1)).toBe(10);
    expect(toCents(0.29)).toBe(29);
    expect(toCents(1234.56)).toBe(123456);
    expect(toCents(999999.99)).toBe(99999999);
  });

  it('never drifts when summing, which is the whole point', () => {
    const cents = [86.42, 312.0, 418.6, 0.1, 0.2].map((v) => toCents(v)!);
    expect(sum(cents)).toBe(81732);
    // The float equivalent would be 817.3200000000001.
  });
});

describe('formatMoney', () => {
  it('formats dollars and cents', () => {
    expect(formatMoney(120488)).toBe('$1,204.88');
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('puts the minus outside the dollar sign', () => {
    expect(formatMoney(-8900)).toBe('-$89.00');
  });

  it('can drop the cents for tiles', () => {
    expect(formatMoney(120488, { cents: false })).toBe('$1,205');
  });
});

describe('formatMoneyCompact', () => {
  it('abbreviates by magnitude', () => {
    expect(formatMoneyCompact(34000)).toBe('$340');
    expect(formatMoneyCompact(120488)).toBe('$1.2k');
    expect(formatMoneyCompact(140000000)).toBe('$1.4M');
  });

  it('keeps the sign', () => {
    expect(formatMoneyCompact(-120488)).toBe('-$1.2k');
  });
});

describe('pctChange', () => {
  it('computes a fraction', () => {
    expect(pctChange(10000, 12000)).toBeCloseTo(0.2);
  });

  it('returns null from a zero base instead of Infinity', () => {
    expect(pctChange(0, 5000)).toBeNull();
  });

  it('handles a negative base by magnitude', () => {
    // Debt shrinking from -1000 to -500 is a 50% improvement, not -50%.
    expect(pctChange(-100000, -50000)).toBeCloseTo(0.5);
  });
});
