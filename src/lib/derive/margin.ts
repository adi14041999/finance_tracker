/**
 * Margin: how much is borrowed, sampled every Monday.
 *
 * Two things matter about a margin balance and neither is visible in a single
 * number. The LEVEL is what you owe. The DIRECTION is whether you are working
 * it down or letting it run — and only the sequence of readings shows that,
 * which is the whole reason for sampling on a fixed cadence.
 *
 * Nothing here treats an off-schedule reading as wrong. A reading taken on the
 * Tuesday is still true; the schedule exists to make sure one gets taken at
 * all, so the useful output is "the next one is due on the 17th", not a
 * complaint about the last one.
 */

import type { MarginReading } from '../types';
// These live in dates.ts now. Re-exported so the margin module still reads as
// one piece, and so nothing that imports them from here has to move.
import { addDays, daysBetween } from '../dates';

export { addDays, daysBetween };

/**
 * The first Monday of tracking: 17 August 2026. Every reading is due a week
 * after the last.
 *
 * Deliberately the same Monday the mission opens, so a margin reading and a
 * mission week start always fall on the same day. Two weekly rhythms a fortnight
 * out of phase would be two things to remember instead of one.
 */
export const MARGIN_ANCHOR = '2026-08-17';
export const MARGIN_INTERVAL_DAYS = 7;

export interface MarginRow extends MarginReading {
  /** Change since the previous reading. Null for the first one. */
  changeCents: number | null;
  /** Days since the previous reading. Null for the first one. */
  daysSince: number | null;
}

export interface MarginSummary {
  /** The most recent reading — what is owed right now. */
  currentCents: number;
  currentDate: string | null;
  /** Change since the reading before it. Null when there is only one. */
  changeCents: number | null;

  peakCents: number;
  peakDate: string | null;
  /** Down from the peak. 0..1, or null with nothing to compare. */
  offPeak: number | null;

  readings: number;
  /** Total movement down across every reading that fell. */
  paidDownCents: number;
  /** Total movement up across every reading that rose. */
  borrowedCents: number;
  cleared: boolean;
}

export interface MarginSchedule {
  /** The next date a reading is due, a week on from the last one taken. */
  nextDue: string;
  /** Days until that date. Negative once it has passed. */
  daysUntil: number;
  overdue: boolean;
  /** True before the first reading is due at all. */
  notStarted: boolean;
}

export function marginRows(readings: MarginReading[]): MarginRow[] {
  return [...readings]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r, i, all) => {
      const prev = i > 0 ? all[i - 1] : null;
      return {
        ...r,
        changeCents: prev ? r.marginCents - prev.marginCents : null,
        daysSince: prev ? daysBetween(prev.date, r.date) : null,
      };
    });
}

export function marginSummary(rows: MarginRow[]): MarginSummary {
  if (rows.length === 0) {
    return {
      currentCents: 0, currentDate: null, changeCents: null,
      peakCents: 0, peakDate: null, offPeak: null,
      readings: 0, paidDownCents: 0, borrowedCents: 0, cleared: false,
    };
  }

  const last = rows[rows.length - 1];
  const peak = rows.reduce((a, r) => (r.marginCents > a.marginCents ? r : a), rows[0]);

  let paidDown = 0;
  let borrowed = 0;
  for (const r of rows) {
    if (r.changeCents === null) continue;
    if (r.changeCents < 0) paidDown += -r.changeCents;
    else borrowed += r.changeCents;
  }

  return {
    currentCents: last.marginCents,
    currentDate: last.date,
    changeCents: last.changeCents,
    peakCents: peak.marginCents,
    peakDate: peak.date,
    // Progress off the high-water mark. Meaningless if the peak is zero, and
    // null rather than 0 so the page can leave it out instead of claiming 0%.
    offPeak: peak.marginCents > 0 ? (peak.marginCents - last.marginCents) / peak.marginCents : null,
    readings: rows.length,
    paidDownCents: paidDown,
    borrowedCents: borrowed,
    cleared: last.marginCents === 0,
  };
}

/**
 * When the next reading is due.
 *
 * Counted forward from the last reading actually taken, not from the anchor —
 * so a reading logged a few days late shifts the following one rather than
 * leaving you permanently behind a schedule you can never catch up with.
 *
 * With a weekly cadence that matters more than it would fortnightly: miss a
 * Monday and a fixed-grid schedule would report you overdue forever after.
 */
export function marginSchedule(rows: MarginRow[], today: string): MarginSchedule {
  if (rows.length === 0) {
    const daysUntil = daysBetween(today, MARGIN_ANCHOR);
    return {
      nextDue: MARGIN_ANCHOR,
      daysUntil,
      overdue: daysUntil < 0,
      notStarted: true,
    };
  }

  const last = rows[rows.length - 1].date;
  let next = addDays(last, MARGIN_INTERVAL_DAYS);
  // If several intervals have gone by, point at the one now due rather than
  // one already long past.
  while (daysBetween(today, next) < -MARGIN_INTERVAL_DAYS) {
    next = addDays(next, MARGIN_INTERVAL_DAYS);
  }

  const daysUntil = daysBetween(today, next);
  return { nextDue: next, daysUntil, overdue: daysUntil < 0, notStarted: false };
}
