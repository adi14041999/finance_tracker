import { describe, it, expect } from 'vitest';
import {
  premiumDays, monthRows, yearRows, premiumStats,
  calendarYear, weekdayOf, divergingScale,
} from './premiums';
import type { PremiumMonth } from '../types';

let row = 1;

/** Dollars in, cents out. `days` is [dayOfMonth, dollars] pairs. */
function month(m: string, days: [number, number][]): PremiumMonth {
  const entries = days.map(([day, d]) => ({ day, amountCents: Math.round(d * 100) }));
  return {
    month: m,
    days: entries,
    totalCents: entries.reduce((a, d) => a + d.amountCents, 0),
    row: row++,
  };
}

describe('daily series', () => {
  it('runs a cumulative total across month boundaries', () => {
    const days = premiumDays([
      month('2024-01', [[1, 100], [2, 50]]),
      month('2024-02', [[1, 25]]),
    ]);
    expect(days.map((d) => d.cumulativeCents)).toEqual([10_000, 15_000, 17_500]);
    expect(days.map((d) => d.date)).toEqual(['2024-01-01', '2024-01-02', '2024-02-01']);
  });

  it('zero-pads the date so string sorting is chronological', () => {
    const [d] = premiumDays([month('2024-03', [[7, 1]])]);
    expect(d.date).toBe('2024-03-07');
  });

  it('sorts months and days regardless of sheet order', () => {
    const days = premiumDays([
      month('2024-02', [[5, 1], [2, 1]]),
      month('2024-01', [[9, 1]]),
    ]);
    expect(days.map((d) => d.date)).toEqual(['2024-01-09', '2024-02-02', '2024-02-05']);
  });

  it('keeps a zero day in the series but not as an active day', () => {
    const days = premiumDays([month('2024-01', [[1, 0], [2, 500]])]);
    expect(days).toHaveLength(2);
    expect(premiumStats(days).activeDays).toBe(1);
  });
});

describe('monthly rows', () => {
  it('carries the month total straight through', () => {
    const [r] = monthRows([month('2024-01', [[1, 6007.57]])]);
    expect(r.totalCents).toBe(600_757);
  });

  it('counts active days, not filled cells', () => {
    const [r] = monthRows([month('2024-01', [[1, 0], [2, 0], [3, 10]])]);
    expect(r.activeDays).toBe(1);
  });
});

describe('stats', () => {
  const days = premiumDays([
    month('2024-01', [[1, 100], [2, 0], [3, -30], [4, 200], [5, -10]]),
  ]);
  const s = premiumStats(days);

  it('treats flat days as neither wins nor losses', () => {
    expect(s.loggedDays).toBe(5);
    expect(s.activeDays).toBe(4);
    expect(s.upDays).toBe(2);
    expect(s.downDays).toBe(2);
    expect(s.winRate).toBe(0.5);
  });

  it('splits gross winnings from gross losses', () => {
    expect(s.grossUpCents).toBe(30_000);
    expect(s.grossDownCents).toBe(-4_000);
    expect(s.totalCents).toBe(26_000);
  });

  it('reports medians of each side separately', () => {
    expect(s.medianUpCents).toBe(15_000); // (100 + 200) / 2
    expect(s.medianDownCents).toBe(-2_000); // (-30 + -10) / 2
  });

  it('has no win rate at all when nothing traded', () => {
    const flat = premiumStats(premiumDays([month('2024-01', [[1, 0]])]));
    expect(flat.winRate).toBeNull();
    expect(flat.totalCents).toBe(0);
  });
});

describe('drawdown', () => {
  it('measures the fall from the highest point reached, not from zero', () => {
    // Up to 1,000, down to 200, back to 600. The drawdown is 800, not 400.
    const days = premiumDays([
      month('2024-01', [[1, 1000], [2, -800], [3, 400]]),
    ]);
    const s = premiumStats(days);
    expect(s.peakCents).toBe(100_000);
    expect(s.maxDrawdownCents).toBe(80_000);
    expect(s.drawdownAt).toBe('2024-01-02');
  });

  it('keeps the deepest drawdown, not the most recent', () => {
    const days = premiumDays([
      month('2024-01', [[1, 1000], [2, -900], [3, 2000], [4, -300]]),
    ]);
    expect(premiumStats(days).maxDrawdownCents).toBe(90_000);
    expect(premiumStats(days).drawdownAt).toBe('2024-01-02');
  });

  it('is zero for a series that only ever rises', () => {
    const s = premiumStats(premiumDays([month('2024-01', [[1, 10], [2, 20]])]));
    expect(s.maxDrawdownCents).toBe(0);
    expect(s.drawdownAt).toBeNull();
  });
});

describe('calendar geometry', () => {
  it('reads weekdays in UTC, so no cell shifts a column', () => {
    // The classic bug: new Date('2026-01-12') is the 11th in any US timezone.
    expect(weekdayOf('2026-01-12')).toBe(1); // Monday
    expect(weekdayOf('2024-01-01')).toBe(1); // Monday
    expect(weekdayOf('2025-01-01')).toBe(3); // Wednesday
  });

  it('puts January 1 in week 0 and the right weekday row', () => {
    const days = premiumDays([month('2024-01', [[1, 5]])]);
    const cal = calendarYear(days, '2024');
    expect(cal.cells[0]).toMatchObject({ week: 0, weekday: 1 });
  });

  it('advances a week at each Sunday, not every seventh day', () => {
    // 2024-01-01 is a Monday, so the first Sunday is the 7th — week 1.
    const days = premiumDays([month('2024-01', [[6, 1], [7, 1], [8, 1]])]);
    const cal = calendarYear(days, '2024');
    expect(cal.cells.map((c) => c.week)).toEqual([0, 1, 1]);
    expect(cal.cells.map((c) => c.weekday)).toEqual([6, 0, 1]);
  });

  it('keeps other years out of the grid', () => {
    const days = premiumDays([month('2024-12', [[31, 1]]), month('2025-01', [[1, 1]])]);
    expect(calendarYear(days, '2025').cells).toHaveLength(1);
    expect(calendarYear(days, '2025').cells[0].date).toBe('2025-01-01');
  });

  it('gives twelve month label positions in increasing order', () => {
    const cal = calendarYear(premiumDays([month('2024-06', [[1, 1]])]), '2024');
    expect(cal.monthStarts).toHaveLength(12);
    const weeks = cal.monthStarts.map((m) => m.week);
    expect([...weeks].sort((a, b) => a - b)).toEqual(weeks);
  });

  it('is empty, not broken, for a year with no data', () => {
    const cal = calendarYear([], '2024');
    expect(cal.cells).toEqual([]);
    expect(cal.weeks).toBe(0);
  });
});

describe('diverging scale', () => {
  it('clamps rather than letting one outlier flatten everything else', () => {
    const days = premiumDays([
      month('2024-01', Array.from({ length: 20 }, (_, i) => [i + 1, 100] as [number, number])),
      month('2024-02', [[1, -120000]]),
    ]);
    const scale = divergingScale(days);
    expect(scale(-12_000_000)).toBe(-1);
    // An ordinary day still reaches the end of the ramp instead of vanishing.
    expect(Math.abs(scale(10_000))).toBeGreaterThan(0.5);
  });

  it('is flat when there is nothing to scale', () => {
    expect(divergingScale([])(500)).toBe(0);
  });
});

/**
 * Adi's real ledger, January 2024 - July 2026. Monthly totals only; each is
 * carried by a single synthetic day, which is enough to check the aggregation
 * without embedding 941 cells. Every figure was reconciled against the day
 * cells in his sheet, so a change that moves these moved something real.
 */
describe('reconciles against the real sheet', () => {
  const REAL: [string, number][] = [
    ['2024-01', 6007.57], ['2024-02', 3610.40], ['2024-03', 1498.72],
    ['2024-04', -1289.25], ['2024-05', 22015.47], ['2024-06', 9044.26],
    ['2024-07', 9150.92], ['2024-08', 6035.13], ['2024-09', 4498.44],
    ['2024-10', 7348.95], ['2024-11', 6370.62], ['2024-12', 6944.61],
    ['2025-01', 6708.11], ['2025-02', 10210.12], ['2025-03', 6712.92],
    ['2025-04', 5721.67], ['2025-05', 2728.07], ['2025-06', 5158.08],
    ['2025-07', 6168.21], ['2025-08', -30926.44], ['2025-09', 10914.20],
    ['2025-10', 11395.40], ['2025-11', 12029.23], ['2025-12', 7877.22],
    ['2026-01', -110216.88], ['2026-02', 13008.04], ['2026-03', 7049.36],
    ['2026-04', 9315.84], ['2026-05', 6487.01], ['2026-06', 8586.61],
    ['2026-07', 12700.40],
  ];

  const months = REAL.map(([m, total]) => month(m, [[1, total]]));
  const rows = monthRows(months);
  const years = yearRows(months);
  const stats = premiumStats(premiumDays(months));

  it('totals $82,863.01 across 31 months', () => {
    expect(stats.totalCents).toBe(8_286_301);
    expect(rows).toHaveLength(31);
  });

  it('splits into the three years', () => {
    expect(years.map((y) => [y.year, y.totalCents])).toEqual([
      ['2024', 8_123_584], // $81,235.84
      ['2025', 5_469_679], // $54,696.79
      ['2026', -5_306_962], // -$53,069.62
    ]);
    expect(years.map((y) => y.months)).toEqual([12, 12, 7]);
  });

  it('finds the peak and the drawdown that follows it', () => {
    // Cumulative peaks at $135,932.63 after December 2025, then January's
    // -$110,216.88 takes it to $25,715.75.
    expect(stats.peakCents).toBe(13_593_263);
    expect(stats.maxDrawdownCents).toBe(11_021_688);
    expect(stats.drawdownAt).toBe('2026-01-01');
  });

  it('names the two months that did the damage', () => {
    expect(stats.worst.slice(0, 2).map((d) => d.month)).toEqual(['2026-01', '2025-08']);
  });

  it('shows how much of the winnings the losing months consume', () => {
    // Three losing months out of 31 take back $142,432.57 of $225,295.58 —
    // 63% of everything the other 28 made.
    expect(stats.grossUpCents).toBe(22_529_558);
    expect(stats.grossDownCents).toBe(-14_243_257);
    expect(stats.upDays).toBe(28);
    expect(stats.downDays).toBe(3);
    expect(stats.grossUpCents + stats.grossDownCents).toBe(stats.totalCents);
  });
});
