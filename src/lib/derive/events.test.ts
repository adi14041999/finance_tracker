import { describe, it, expect } from 'vitest';
import { eventRows, eventYears, eventSummary } from './events';
import type { EventMonth } from '../types';

let row = 1;
const month = (m: string, dollars: number): EventMonth =>
  ({ month: m, totalCents: Math.round(dollars * 100), row: row++ });

describe('running totals', () => {
  it('accumulates within a year', () => {
    const rows = eventRows([month('2026-01', -100), month('2026-02', -50), month('2026-03', 20)]);
    expect(rows.map((r) => r.ytdCents)).toEqual([-10_000, -15_000, -13_000]);
  });

  it('resets year to date each January, but not the all-time total', () => {
    const rows = eventRows([month('2025-12', -100), month('2026-01', -50)]);
    expect(rows.map((r) => r.ytdCents)).toEqual([-10_000, -5_000]);
    expect(rows.map((r) => r.cumulativeCents)).toEqual([-10_000, -15_000]);
  });

  it('sorts months regardless of sheet order', () => {
    const rows = eventRows([month('2026-03', 1), month('2026-01', 2)]);
    expect(rows.map((r) => r.month)).toEqual(['2026-01', '2026-03']);
  });
});

describe('summary', () => {
  const rows = eventRows([
    month('2026-01', 0), month('2026-02', -100), month('2026-03', 40), month('2026-04', -20),
  ]);
  const s = eventSummary(rows);

  it('counts up, down and flat months separately', () => {
    expect(s.monthsUp).toBe(1);
    expect(s.monthsDown).toBe(2);
    expect(s.monthsFlat).toBe(1);
  });

  it('splits gross gains from gross losses', () => {
    expect(s.grossUpCents).toBe(4_000);
    expect(s.grossDownCents).toBe(-12_000);
    expect(s.totalCents).toBe(-8_000);
  });

  it('measures how much of the damage the worst month did', () => {
    expect(s.worst!.month).toBe('2026-02');
    expect(s.worstShare).toBeCloseTo(10_000 / 12_000, 10);
  });

  it('has no worst-share when nothing has been lost', () => {
    const clean = eventSummary(eventRows([month('2026-01', 50)]));
    expect(clean.worstShare).toBeNull();
  });

  it('is all zeros rather than NaN on an empty ledger', () => {
    const empty = eventSummary([]);
    expect(empty.totalCents).toBe(0);
    expect(empty.worst).toBeNull();
    expect(empty.latestYear).toBeNull();
  });
});

describe('years', () => {
  it('counts months and active months separately', () => {
    const y = eventYears(eventRows([
      month('2026-01', 0), month('2026-02', -100), month('2025-12', 5),
    ]));
    expect(y.map((x) => x.year)).toEqual(['2025', '2026']);
    expect(y[1].months).toBe(2);
    expect(y[1].activeMonths).toBe(1);
  });
});

/** The real 2026 ledger, checked against the sheet's own YTD column. */
describe('reconciles against the real sheet', () => {
  const REAL: [string, number][] = [
    ['2026-01', 0], ['2026-02', -47796], ['2026-03', -1116], ['2026-04', -17250],
    ['2026-05', 0], ['2026-06', 1500], ['2026-07', -146506], ['2026-08', 723],
    ['2026-09', 0], ['2026-10', 0], ['2026-11', 0], ['2026-12', 0],
  ];
  const rows = eventRows(REAL.map(([m, v]) => month(m, v)));
  const s = eventSummary(rows);

  it('reproduces the YTD column month for month', () => {
    const ytd = REAL.map(([m]) => rows.find((r) => r.month === m)!.ytdCents);
    expect(ytd).toEqual([
      0, -4_779_600, -4_891_200, -6_616_200, -6_616_200, -6_466_200,
      -21_116_800, -21_044_500, -21_044_500, -21_044_500, -21_044_500, -21_044_500,
    ]);
  });

  it('lands on -$210,445', () => {
    expect(s.totalCents).toBe(-21_044_500);
    expect(s.ytdCents).toBe(-21_044_500);
    expect(s.latestYear).toBe('2026');
  });

  it('splits into $2,223 of gains against $212,668 of losses', () => {
    expect(s.grossUpCents).toBe(222_300);
    expect(s.grossDownCents).toBe(-21_266_800);
    expect(s.monthsUp).toBe(2);
    expect(s.monthsDown).toBe(4);
    expect(s.monthsFlat).toBe(6);
  });

  it('puts 69% of all the losses in July alone', () => {
    expect(s.worst!.month).toBe('2026-07');
    expect(s.worst!.totalCents).toBe(-14_650_600);
    expect(s.worstShare).toBeCloseTo(0.689, 3);
  });

  it('finds June as the best month at $1,500', () => {
    expect(s.best!.month).toBe('2026-06');
    expect(s.best!.totalCents).toBe(150_000);
  });
});
