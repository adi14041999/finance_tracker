/**
 * Options-premium P&L, from the wide month-by-day grid.
 *
 * The defining property of this data is that it is *fat-tailed*. Ninety-odd
 * percent of active days are small wins; a handful of days are catastrophic.
 * Almost every summary statistic you would reach for by habit — a mean, a
 * monthly average, a win rate — flatters it, because they all describe the
 * body of the distribution and this distribution lives in its tail.
 *
 * So the numbers here are chosen to make the tail impossible to miss: the
 * running cumulative (where a single day is a cliff, not a rounding error),
 * the peak-to-trough drawdown, and the gross up/down split, which shows how
 * much of the winnings the losing days consume. The win rate is computed too,
 * but it is presented next to those, never alone.
 */

import type { PremiumMonth } from '../types';

export interface PremiumDay {
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  day: number;
  amountCents: number;
  /** Running total of every day up to and including this one. */
  cumulativeCents: number;
}

export interface PremiumMonthRow {
  month: string;
  totalCents: number;
  cumulativeCents: number;
  activeDays: number;
}

export interface PremiumYearRow {
  year: string;
  totalCents: number;
  months: number;
}

export interface PremiumStats {
  totalCents: number;
  firstMonth: string | null;
  lastMonth: string | null;

  loggedDays: number;
  activeDays: number;
  upDays: number;
  downDays: number;
  /** Share of *active* days that made money. Flat days are not wins. */
  winRate: number | null;

  medianUpCents: number | null;
  medianDownCents: number | null;
  /** Everything the winning days made, and everything the losing days took. */
  grossUpCents: number;
  grossDownCents: number;

  best: PremiumDay[];
  worst: PremiumDay[];

  peakCents: number;
  /** Largest peak-to-trough fall in the running total, and where it bottomed. */
  maxDrawdownCents: number;
  drawdownAt: string | null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function premiumDays(months: PremiumMonth[]): PremiumDay[] {
  const out: PremiumDay[] = [];
  let running = 0;
  for (const m of [...months].sort((a, b) => a.month.localeCompare(b.month))) {
    for (const d of [...m.days].sort((a, b) => a.day - b.day)) {
      running += d.amountCents;
      out.push({
        date: `${m.month}-${pad(d.day)}`,
        month: m.month,
        day: d.day,
        amountCents: d.amountCents,
        cumulativeCents: running,
      });
    }
  }
  return out;
}

export function monthRows(months: PremiumMonth[]): PremiumMonthRow[] {
  let running = 0;
  return [...months]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => {
      running += m.totalCents;
      return {
        month: m.month,
        totalCents: m.totalCents,
        cumulativeCents: running,
        activeDays: m.days.filter((d) => d.amountCents !== 0).length,
      };
    });
}

export function yearRows(months: PremiumMonth[]): PremiumYearRow[] {
  const byYear = new Map<string, { total: number; months: number }>();
  for (const m of months) {
    const year = m.month.slice(0, 4);
    const e = byYear.get(year) ?? { total: 0, months: 0 };
    e.total += m.totalCents;
    e.months += 1;
    byYear.set(year, e);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, e]) => ({ year, totalCents: e.total, months: e.months }));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function premiumStats(days: PremiumDay[]): PremiumStats {
  const up = days.filter((d) => d.amountCents > 0);
  const down = days.filter((d) => d.amountCents < 0);
  const active = up.length + down.length;

  // Drawdown walks the running total once, tracking the highest point seen so
  // far. The largest fall from any peak is the number that says what this
  // strategy can cost you, which no average of daily P&L will ever reveal.
  let peak = 0;
  let maxDrawdown = 0;
  let drawdownAt: string | null = null;
  for (const d of days) {
    if (d.cumulativeCents > peak) peak = d.cumulativeCents;
    const fall = peak - d.cumulativeCents;
    if (fall > maxDrawdown) {
      maxDrawdown = fall;
      drawdownAt = d.date;
    }
  }

  const byWorst = [...days].sort((a, b) => a.amountCents - b.amountCents);

  return {
    totalCents: days.length ? days[days.length - 1].cumulativeCents : 0,
    firstMonth: days.length ? days[0].month : null,
    lastMonth: days.length ? days[days.length - 1].month : null,

    loggedDays: days.length,
    activeDays: active,
    upDays: up.length,
    downDays: down.length,
    winRate: active > 0 ? up.length / active : null,

    medianUpCents: median(up.map((d) => d.amountCents)),
    medianDownCents: median(down.map((d) => d.amountCents)),
    grossUpCents: up.reduce((a, d) => a + d.amountCents, 0),
    grossDownCents: down.reduce((a, d) => a + d.amountCents, 0),

    best: byWorst.slice(-5).reverse(),
    worst: byWorst.slice(0, 5),

    peakCents: peak,
    maxDrawdownCents: maxDrawdown,
    drawdownAt,
  };
}

/* ------------------------------------------------------------------ calendar */

export interface CalendarCell {
  date: string;
  amountCents: number;
  /** Column: weeks since the first Sunday on or before Jan 1. */
  week: number;
  /** Row: 0 = Sunday .. 6 = Saturday. */
  weekday: number;
}

export interface CalendarYear {
  year: string;
  cells: CalendarCell[];
  weeks: number;
  /** First week index of each month, for the month labels along the top. */
  monthStarts: { month: number; week: number }[];
}

/**
 * Weekday for a YYYY-MM-DD, without ever constructing a local-time Date.
 *
 * `new Date('2026-01-12')` is UTC midnight, which in any US timezone is the
 * evening of the 11th — so a local getDay() would shift every cell in the
 * calendar back by one column. Building from Date.UTC and reading a UTC getter
 * keeps the arithmetic in one timezone from end to end.
 */
export function weekdayOf(date: string): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Days from Jan 1 of `year` to `date`, inclusive of neither end's timezone. */
function dayOfYear(date: string, year: number): number {
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const start = Date.UTC(year, 0, 1);
  return Math.round((Date.UTC(year, m - 1, d) - start) / 86_400_000);
}

/**
 * Lays a year of days out as a GitHub-style grid: one column per week, one row
 * per weekday. Week 0 is the week containing January 1, so the first column is
 * usually partial — which is correct, and padding it to a full week would put
 * cells on the chart for days in the previous year.
 */
export function calendarYear(days: PremiumDay[], year: string): CalendarYear {
  const y = Number(year);
  const jan1Weekday = weekdayOf(`${year}-01-01`);

  const cells: CalendarCell[] = days
    .filter((d) => d.date.slice(0, 4) === year)
    .map((d) => {
      const weekday = weekdayOf(d.date);
      const week = Math.floor((dayOfYear(d.date, y) + jan1Weekday) / 7);
      return { date: d.date, amountCents: d.amountCents, week, weekday };
    });

  const monthStarts: { month: number; week: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const first = `${year}-${pad(m)}-01`;
    monthStarts.push({ month: m, week: Math.floor((dayOfYear(first, y) + jan1Weekday) / 7) });
  }

  return {
    year,
    cells,
    weeks: cells.length ? Math.max(...cells.map((c) => c.week)) + 1 : 0,
    monthStarts,
  };
}

/**
 * Where a value sits on the diverging colour scale, as -1..+1.
 *
 * Scaled by a percentile rather than the extreme, because one -$121,291 day
 * against a $211 median would otherwise collapse every ordinary day to the
 * neutral midpoint — a calendar of 940 blank cells and one dark square, which
 * is true but tells you nothing. Values past the cap clamp to the end of the
 * ramp and are called out by name elsewhere instead.
 */
export function divergingScale(days: PremiumDay[]): (cents: number) => number {
  const magnitudes = days
    .map((d) => Math.abs(d.amountCents))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (magnitudes.length === 0) return () => 0;
  const cap = magnitudes[Math.floor(magnitudes.length * 0.95)] || magnitudes[magnitudes.length - 1];
  return (cents: number) => Math.max(-1, Math.min(1, cents / cap));
}
