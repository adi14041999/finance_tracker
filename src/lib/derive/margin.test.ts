import { describe, it, expect } from 'vitest';
import {
  marginRows, marginSummary, marginSchedule, daysBetween, addDays, MARGIN_ANCHOR,
} from './margin';
import type { MarginReading } from '../types';

let row = 1;
const read = (date: string, dollars: number): MarginReading =>
  ({ date, marginCents: Math.round(dollars * 100), row: row++ });

describe('date arithmetic', () => {
  it('counts days across a month boundary', () => {
    expect(daysBetween('2026-08-03', '2026-08-10')).toBe(7);
    expect(daysBetween('2026-08-31', '2026-09-07')).toBe(7);
  });

  it('counts backwards as negative', () => {
    expect(daysBetween('2026-08-10', '2026-08-03')).toBe(-7);
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-08-31', 7)).toBe('2026-09-07');
    expect(addDays('2026-12-29', 7)).toBe('2027-01-05');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-22', 7)).toBe('2028-02-29');
    expect(daysBetween('2028-02-29', '2028-03-07')).toBe(7);
  });
});

describe('rows', () => {
  it('works out change and gap against the previous reading', () => {
    const rows = marginRows([read('2026-08-03', 12000), read('2026-08-10', 9500)]);
    expect(rows[0].changeCents).toBeNull();
    expect(rows[0].daysSince).toBeNull();
    expect(rows[1].changeCents).toBe(-250_000);
    expect(rows[1].daysSince).toBe(7);
  });

  it('sorts by date regardless of sheet order', () => {
    const rows = marginRows([read('2026-08-10', 1), read('2026-08-03', 2)]);
    expect(rows.map((r) => r.date)).toEqual(['2026-08-03', '2026-08-10']);
  });
});

describe('summary', () => {
  const rows = marginRows([
    read('2026-08-03', 10000),
    read('2026-08-10', 14000),
    read('2026-08-17', 6000),
  ]);
  const s = marginSummary(rows);

  it('reports the latest reading as current', () => {
    expect(s.currentCents).toBe(600_000);
    expect(s.currentDate).toBe('2026-08-17');
    expect(s.changeCents).toBe(-800_000);
  });

  it('finds the peak and how far off it you are', () => {
    expect(s.peakCents).toBe(1_400_000);
    expect(s.peakDate).toBe('2026-08-10');
    expect(s.offPeak).toBeCloseTo((14000 - 6000) / 14000, 10);
  });

  it('separates money paid down from money borrowed', () => {
    expect(s.borrowedCents).toBe(400_000);
    expect(s.paidDownCents).toBe(800_000);
  });

  it('knows when the margin is clear', () => {
    expect(s.cleared).toBe(false);
    expect(marginSummary(marginRows([read('2026-08-03', 0)])).cleared).toBe(true);
  });

  it('is all zeros rather than NaN with no readings', () => {
    const empty = marginSummary([]);
    expect(empty.currentCents).toBe(0);
    expect(empty.offPeak).toBeNull();
    expect(empty.currentDate).toBeNull();
  });

  it('has no off-peak figure when the peak is zero', () => {
    // Never borrowed, so "down from peak" has nothing to divide by.
    expect(marginSummary(marginRows([read('2026-08-03', 0)])).offPeak).toBeNull();
  });
});

describe('schedule', () => {
  it('points at the anchor before tracking starts', () => {
    const s = marginSchedule([], '2026-08-16');
    expect(s.nextDue).toBe(MARGIN_ANCHOR);
    expect(s.daysUntil).toBe(1);
    expect(s.notStarted).toBe(true);
    expect(s.overdue).toBe(false);
  });

  it('is overdue once the anchor has passed with nothing recorded', () => {
    const s = marginSchedule([], '2026-08-24');
    expect(s.overdue).toBe(true);
    expect(s.daysUntil).toBe(-7);
  });

  it('counts a week from the last reading taken', () => {
    const s = marginSchedule(marginRows([read('2026-08-03', 100)]), '2026-08-06');
    expect(s.nextDue).toBe('2026-08-10');
    expect(s.daysUntil).toBe(4);
    expect(s.overdue).toBe(false);
  });

  it('shifts the cadence when a reading is logged late', () => {
    // Recorded on the Wednesday. The next one is due a week from THAT, not
    // from the Monday it was meant to be — otherwise you are permanently
    // behind a schedule you can never catch up with.
    const s = marginSchedule(marginRows([read('2026-08-05', 100)]), '2026-08-06');
    expect(s.nextDue).toBe('2026-08-12');
  });

  it('does not stack up every missed date after a long gap', () => {
    const s = marginSchedule(marginRows([read('2026-08-03', 100)]), '2026-10-01');
    expect(s.overdue).toBe(true);
    // Points at the one now due, not the first one missed back in August.
    expect(daysBetween(s.nextDue, '2026-10-01')).toBeLessThanOrEqual(7);
  });
});

describe('the tracking cadence itself', () => {
  it('starts on Monday 17 August 2026, the day the mission opens', () => {
    const [y, m, d] = MARGIN_ANCHOR.split('-').map(Number);
    expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay()).toBe(1); // 1 = Monday
  });

  it('lands on a Monday every week when kept to', () => {
    let date = MARGIN_ANCHOR;
    for (let i = 0; i < 26; i++) {
      const [y, m, d] = date.split('-').map(Number);
      expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay()).toBe(1);
      date = addDays(date, 7);
    }
  });
});

describe('the anchor', () => {
  it('is a Monday', () => {
    const [y, m, d] = MARGIN_ANCHOR.split('-').map(Number);
    expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay()).toBe(1);
  });

  it('shares the mission start date, so both weekly rhythms land together', () => {
    expect(MARGIN_ANCHOR).toBe('2026-08-17');
  });
});
