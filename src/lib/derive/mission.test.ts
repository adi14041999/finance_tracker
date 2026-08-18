import { describe, it, expect } from 'vitest';
import {
  missionWeeks, currentWeek, missionStatus,
  MISSION_START, MISSION_END, MISSION_RESERVE_DAY, MISSION_WEEKS, MISSION_DAYS,
  MISSION_DAILY_CENTS, MISSION_TARGET_CENTS,
} from './mission';
import type { MissionDay } from '../types';

let row = 1;
const day = (date: string, dollars: number): MissionDay =>
  ({ date, amountCents: Math.round(dollars * 100), row: row++ });

const weeksOf = (days: MissionDay[], today: string) => missionWeeks(days, today);
const status = (days: MissionDay[], today: string) =>
  missionStatus(missionWeeks(days, today), today);

const dow = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday, 1 = Monday
};

describe('the shape of the window', () => {
  it('runs Mon 17 Aug 2026 to Sun 30 Dec 2029', () => {
    expect(MISSION_START).toBe('2026-08-17');
    expect(MISSION_END).toBe('2029-12-30');
    expect(dow(MISSION_START)).toBe(1);
    expect(dow(MISSION_END)).toBe(0);
  });

  it('holds 31 Dec 2029 back as a reserve, outside the mission', () => {
    expect(MISSION_RESERVE_DAY).toBe('2029-12-31');
    expect(MISSION_RESERVE_DAY > MISSION_END).toBe(true);
    const last = weeksOf([], '2026-08-17')[MISSION_WEEKS - 1];
    expect(last.endDate).toBe(MISSION_END);
    expect(last.days.some((d) => d.date === MISSION_RESERVE_DAY)).toBe(false);
  });

  it('is 1,232 days — exactly 176 whole weeks', () => {
    expect(MISSION_DAYS).toBe(1232);
    expect(MISSION_WEEKS).toBe(176);
    expect(MISSION_DAYS % 7).toBe(0);
    expect(MISSION_WEEKS * 7).toBe(MISSION_DAYS);
  });

  it('runs every week Monday to Sunday, all seven days long', () => {
    for (const w of weeksOf([], '2026-08-17')) {
      expect(dow(w.startDate)).toBe(1);
      expect(dow(w.endDate)).toBe(0);
      expect(w.dayCount).toBe(7);
      expect(w.days).toHaveLength(7);
    }
  });

  it('targets $315,392 — 1,232 days at $256', () => {
    expect(MISSION_DAILY_CENTS).toBe(25_600);
    expect(MISSION_TARGET_CENTS).toBe(31_539_200);
    expect(MISSION_TARGET_CENTS).toBe(MISSION_DAYS * MISSION_DAILY_CENTS);
  });
});

describe('the opening goal', () => {
  it('is exactly $1,792 — seven days at $256, no rounding needed', () => {
    const w = weeksOf([], '2026-08-17')[0];
    expect(w.goalCents).toBe(179_200);
    expect(w.perDayCents).toBe(MISSION_DAILY_CENTS);
  });

  it('projects every future week at today’s pace, not at zero', () => {
    // A week two years out must not be handed the whole outstanding balance.
    // Every unstarted week shows the same rate, scaled by its length.
    const weeks = weeksOf([], '2026-08-17');
    const far = weeks[175];
    expect(far.goalCents).toBeLessThan(200_000);
    expect(far.perDayCents).toBe(weeks[1].perDayCents);
  });
});

describe('recalibration', () => {
  it('lowers later weeks when a week beats its goal', () => {
    const weeks = weeksOf([day('2026-08-17', 5000)], '2026-08-25'); // into week two
    expect(weeks[0].earnedCents).toBe(500_000);
    expect(weeks[0].state).toBe('met');
    expect(weeks[1].goalCents).toBeLessThan(weeks[0].goalCents);
  });

  it('raises later weeks when a week falls short', () => {
    const weeks = weeksOf([day('2026-08-17', 100)], '2026-08-25');
    expect(weeks[0].state).toBe('missed');
    expect(weeks[1].goalCents).toBeGreaterThan(weeks[0].goalCents);
  });

  it('spreads the shortfall over days remaining, not weeks remaining', () => {
    // Week one earns nothing; the $1,792 owed is spread across the 1,225 days
    // that are left, then multiplied back up by this week's seven.
    const weeks = weeksOf([], '2026-08-25');
    expect(weeks[1].goalCents).toBe(Math.ceil((31_539_200 / 1225) * 7));
  });

  it('never lets a mid-week earning move the current week goal', () => {
    const before = weeksOf([], '2026-08-19')[0].goalCents;
    const after = weeksOf([day('2026-08-19', 900)], '2026-08-19')[0].goalCents;
    expect(after).toBe(before);
  });

  it('drops later goals to zero once the target is passed', () => {
    const weeks = weeksOf([day('2026-08-17', 400000)], '2026-08-25');
    expect(weeks[1].goalCents).toBe(0);
    expect(weeks[1].perDayCents).toBe(0);
    expect(weeks[1].progress).toBeNull();
  });

  it('keeps the plan adding up to at least the target', () => {
    const total = weeksOf([], '2026-08-17').reduce((a, w) => a + w.goalCents, 0);
    expect(total).toBeGreaterThanOrEqual(MISSION_TARGET_CENTS);
  });
});

describe('weeks and their days', () => {
  it('orders days Monday first', () => {
    const w = weeksOf([], '2026-08-17')[0];
    expect(w.days[0].date).toBe('2026-08-17');
    expect(w.days[0].dayOfWeek).toBe(1);
    expect(w.days[6].date).toBe('2026-08-23');
  });

  it('separates a logged zero from a day with no row', () => {
    const w = weeksOf([day('2026-08-17', 0)], '2026-08-18')[0];
    expect(w.days[0].state).toBe('blank');
    expect(w.days[1].state).toBe('unlogged');
  });

  it('marks days past today as future whatever is logged', () => {
    const w = weeksOf([day('2026-08-22', 900)], '2026-08-18')[0];
    expect(w.days[5].state).toBe('future');
  });

  it('sums a week from its days, losses included', () => {
    const w = weeksOf([day('2026-08-17', 900), day('2026-08-18', -200)], '2026-08-23')[0];
    expect(w.earnedCents).toBe(70_000);
  });
});

describe('the current week', () => {
  it('finds the week today sits in and what is left of it', () => {
    const w = currentWeek(weeksOf([day('2026-08-17', 300)], '2026-08-19'), '2026-08-19')!;
    expect(w.index).toBe(1);
    expect(w.startDate).toBe('2026-08-17');
    expect(w.endDate).toBe('2026-08-23');
    expect(w.daysElapsed).toBe(3); // Mon, Tue, Wed
    expect(w.daysLeft).toBe(5); // Wed through Sun
    expect(w.remainingCents).toBe(179_200 - 30_000);
  });

  it('has elapsed and remaining both include today', () => {
    const w = currentWeek(weeksOf([], '2026-08-20'), '2026-08-20')!;
    expect(w.daysElapsed + w.daysLeft).toBe(8);
  });

  it('reads 1/7 gone on the Monday and 7/7 on the Sunday', () => {
    expect(currentWeek(weeksOf([], '2026-08-17'), '2026-08-17')!.timeProgress)
      .toBeCloseTo(1 / 7, 10);
    expect(currentWeek(weeksOf([], '2026-08-23'), '2026-08-23')!.timeProgress).toBe(1);
  });

  it('is null before the start, and on the reserve day', () => {
    expect(currentWeek(weeksOf([], '2026-08-16'), '2026-08-16')).toBeNull();
    expect(currentWeek(weeksOf([], MISSION_RESERVE_DAY), MISSION_RESERVE_DAY)).toBeNull();
  });
});

describe('the daily rate', () => {
  it('does not move as the week is earned or as days pass', () => {
    const flat = weeksOf([], '2026-08-17')[0].perDayCents;
    expect(weeksOf([day('2026-08-17', 3000)], '2026-08-20')[0].perDayCents).toBe(flat);
    expect(weeksOf([], '2026-08-22')[0].perDayCents).toBe(flat);
  });

  it('follows the goal when the goal recalibrates between weeks', () => {
    const weeks = weeksOf([day('2026-08-17', 5000)], '2026-08-25');
    expect(weeks[1].perDayCents).toBe(Math.ceil(weeks[1].goalCents / 7));
    expect(weeks[1].perDayCents).toBeLessThan(weeks[0].perDayCents);
  });
});

describe('status', () => {
  it('tracks the long game against $315,392', () => {
    const s = status([day('2026-08-17', 5000)], '2026-08-19');
    expect(s.earnedCents).toBe(500_000);
    expect(s.remainingCents).toBe(31_039_200);
    expect(s.progress).toBeCloseTo(500_000 / 31_539_200, 10);
  });

  it('opens at $1,792 a week', () => {
    expect(status([], '2026-08-17').openingWeeklyCents).toBe(179_200);
  });

  it('counts weeks met and missed once they close', () => {
    const s = status([day('2026-08-17', 5000), day('2026-08-24', 1)], '2026-09-01');
    expect(s.weeksElapsed).toBe(2);
    expect(s.weeksMet).toBe(1);
    expect(s.weeksMissed).toBe(1);
  });

  it('does not judge the week in progress', () => {
    const s = status([], '2026-08-19');
    expect(s.weeksElapsed).toBe(0);
    expect(s.weeksMissed).toBe(0);
    expect(s.currentWeekIndex).toBe(1);
  });

  it('tracks the window from day one to day 1,232', () => {
    expect(status([], '2026-08-17').daysElapsed).toBe(1);
    expect(status([], MISSION_END).daysElapsed).toBe(1232);
    expect(status([], MISSION_END).timeProgress).toBe(1);
  });

  it('is finished on the reserve day', () => {
    const s = status([], MISSION_RESERVE_DAY);
    expect(s.finished).toBe(true);
    expect(s.timeProgress).toBe(1);
  });

  it('is all zeros rather than NaN before the start', () => {
    const s = status([], '2026-08-16');
    expect(s.started).toBe(false);
    expect(s.earnedCents).toBe(0);
    expect(s.progress).toBe(0);
    expect(s.timeProgress).toBe(0);
    expect(s.currentWeekIndex).toBeNull();
  });

  it('goes past 100% rather than clamping', () => {
    const s = status([day('2026-08-17', 400000)], '2026-08-19');
    expect(s.progress).toBeGreaterThan(1);
    expect(s.achieved).toBe(true);
    expect(s.remainingCents).toBe(0);
  });
});
