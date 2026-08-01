/**
 * Event contracts: realized profit and loss, a month at a time.
 *
 * These settle. A contract pays out or it doesn't, so every figure here is
 * final the moment it lands — there is no open position to mark, no price that
 * could move it back, and nothing outstanding to earn. That makes this the
 * simplest ledger in the app and the only one where "recovery" is not a
 * concept: a losing month is simply spent.
 *
 * The year-to-date total resets each January, because that is what the sheet's
 * own column means. An all-time running total is offered separately rather
 * than conflated with it.
 */

import type { EventMonth } from '../types';

export interface EventRow {
  month: string;
  totalCents: number;
  /** Running total within the calendar year, resetting each January. */
  ytdCents: number;
  /** Running total across every month on record, never reset. */
  cumulativeCents: number;
}

export interface EventYearRow {
  year: string;
  totalCents: number;
  months: number;
  /** Months with a figure either way. A flat month is neither. */
  activeMonths: number;
}

export interface EventSummary {
  totalCents: number;
  /** The most recent year's running total — what "YTD" means on the page. */
  ytdCents: number;
  latestYear: string | null;

  monthsUp: number;
  monthsDown: number;
  monthsFlat: number;
  grossUpCents: number;
  grossDownCents: number;

  best: EventRow | null;
  worst: EventRow | null;
  /** Share of all losses carried by the single worst month. 0..1. */
  worstShare: number | null;
}

export function eventRows(months: EventMonth[]): EventRow[] {
  let ytd = 0;
  let cumulative = 0;
  let year = '';
  return [...months]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => {
      if (m.month.slice(0, 4) !== year) {
        year = m.month.slice(0, 4);
        ytd = 0;
      }
      ytd += m.totalCents;
      cumulative += m.totalCents;
      return { month: m.month, totalCents: m.totalCents, ytdCents: ytd, cumulativeCents: cumulative };
    });
}

export function eventYears(rows: EventRow[]): EventYearRow[] {
  const byYear = new Map<string, EventRow[]>();
  for (const r of rows) {
    const y = r.month.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), r]);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, list]) => ({
      year,
      totalCents: list.reduce((a, r) => a + r.totalCents, 0),
      months: list.length,
      activeMonths: list.filter((r) => r.totalCents !== 0).length,
    }));
}

export function eventSummary(rows: EventRow[]): EventSummary {
  const up = rows.filter((r) => r.totalCents > 0);
  const down = rows.filter((r) => r.totalCents < 0);
  const grossDownCents = down.reduce((a, r) => a + r.totalCents, 0);

  const sorted = [...rows].sort((a, b) => a.totalCents - b.totalCents);
  const worst = sorted[0] ?? null;

  const last = rows[rows.length - 1] ?? null;

  return {
    totalCents: last ? last.cumulativeCents : 0,
    ytdCents: last ? last.ytdCents : 0,
    latestYear: last ? last.month.slice(0, 4) : null,

    monthsUp: up.length,
    monthsDown: down.length,
    monthsFlat: rows.length - up.length - down.length,
    grossUpCents: up.reduce((a, r) => a + r.totalCents, 0),
    grossDownCents,

    best: sorted[sorted.length - 1] ?? null,
    worst,
    // How concentrated the damage is. One month at 70% of all losses is a very
    // different situation from twelve months of steady bleed, and the total
    // alone cannot tell them apart.
    worstShare:
      worst && worst.totalCents < 0 && grossDownCents < 0
        ? worst.totalCents / grossDownCents
        : null,
  };
}
