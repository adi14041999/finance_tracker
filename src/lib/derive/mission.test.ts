import { describe, it, expect } from 'vitest';
import { missionWeeks, currentWeek, weekSummary } from './mission';
import { sprintViews, SPRINT_DAILY_CENTS } from './sprints';
import type { MissionDay, Sprint } from '../types';

let row = 1;
const day = (date: string, dollars: number): MissionDay =>
  ({ date, amountCents: Math.round(dollars * 100), row: row++ });

/** The live sprint: vandromme, $30,000 from Fri 18 Sep 2026. Sixteen weeks. */
const VANDROMME: Sprint = {
  index: 1, name: 'vandromme', targetCents: 3_000_000,
  started: '2026-09-18', completed: null, row: 2,
};

// Every sprint in these tests has a start date, so the view is always a dated
// one — asserted rather than cast, so a change that broke it would fail here.
const view = (today: string, days: MissionDay[] = [], s: Sprint = VANDROMME) => {
  const v = sprintViews([s], days, today)[0];
  if (v.started === null || v.estimatedEnd === null) throw new Error('undated sprint');
  return { ...v, started: v.started, estimatedEnd: v.estimatedEnd };
};

const weeksOf = (days: MissionDay[], today: string, s: Sprint = VANDROMME) =>
  missionWeeks(days, today, view(today, days, s));

const dow = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday, 5 = Friday
};

describe('the shape of the weeks', () => {
  it('anchors week one to the day the sprint started', () => {
    const w = weeksOf([], '2026-09-18')[0];
    expect(w.startDate).toBe('2026-09-18');
    expect(w.endDate).toBe('2026-09-24');
    expect(dow(w.startDate)).toBe(5); // a Friday, because the sprint began on one
    expect(dow(w.endDate)).toBe(4);   // through Thursday
  });

  it('follows the sprint, so a Tuesday sprint gets Tuesday weeks', () => {
    const tue: Sprint = { ...VANDROMME, started: '2026-09-22' }; // a Tuesday
    const w = missionWeeks([], '2026-09-22', view('2026-09-22', [], tue))[0];
    expect(dow(w.startDate)).toBe(2);
    expect(dow(w.endDate)).toBe(1);
  });

  it('covers the estimate in whole weeks, with no stub at the end', () => {
    const weeks = weeksOf([], '2026-09-18');
    expect(weeks).toHaveLength(16); // 30000 / 1883 = 15.93, nearest is 16
    expect(weeks.every((w) => w.dayCount === 7)).toBe(true);
    expect(weeks[15].endDate).toBe('2027-01-07');
  });

  it('has no weeks at all when no sprint is running', () => {
    expect(missionWeeks([], '2026-09-18', null)).toEqual([]);
  });

  it('keeps overrun weeks a full seven days long', () => {
    // Clipping the last week to today made "this week" one day long on the
    // first day of an overrun, then two, then three. The goal, the chart and
    // the comparison with earlier weeks all need a whole week.
    // vandromme's estimate ends Thu 7 Jan; this is the day after.
    const weeks = weeksOf([], '2027-01-08');
    const last = weeks[weeks.length - 1];
    expect(weeks).toHaveLength(17); // the sixteen of the estimate, plus one
    expect(weeks.every((w) => w.dayCount === 7)).toBe(true);
    expect(last.startDate).toBe('2027-01-08');
    expect(last.endDate).toBe('2027-01-14');
  });

  it('asks the flat rate for a whole overrun week, not one day of it', () => {
    const weeks = weeksOf([], '2027-01-08');
    const last = weeks[weeks.length - 1];
    expect(last.goalCents).toBe(SPRINT_DAILY_CENTS * 7);
    expect(last.perDayCents).toBe(SPRINT_DAILY_CENTS);
  });

  it('grows past the estimate when the sprint overruns', () => {
    // Day 150 of a 112-day estimate: the weeks keep going, because the sprint has.
    const weeks = weeksOf([], '2027-02-14');
    expect(weeks.length).toBeGreaterThan(16);
    expect(weeks[weeks.length - 1].endDate >= '2026-12-06').toBe(true);
  });

  it('clips the last week to the finish date, whatever weekday that is', () => {
    // The real end is the day the target is crossed, which is any day of the
    // week. Only a logged finish is allowed to cut a week short.
    for (const finish of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']) {
      const done = { ...VANDROMME, completed: finish };
      const weeks = missionWeeks([], '2026-12-01', view('2026-12-01', [], done));
      const last = weeks[weeks.length - 1];
      expect(last.endDate).toBe(finish);
      expect(last.dayCount).toBeLessThanOrEqual(7);
      expect(last.days.every((d) => d.date <= finish)).toBe(true);
    }
  });

  it('stops at the finish date once one is logged', () => {
    const done: Sprint = { ...VANDROMME, completed: '2026-10-08' };
    const weeks = missionWeeks([], '2026-12-01', view('2026-12-01', [], done), );
    expect(weeks[weeks.length - 1].endDate).toBe('2026-10-08');
  });
});

describe('the opening goal', () => {
  it('is the target split evenly across the whole weeks of the estimate', () => {
    // $30,000 over sixteen weeks is $1,875 a week exactly — the implied daily
    // rate is $267.86, below $269, because sixteen weeks is the nearer fit to
    // 15.93 and the target is never adjusted to meet the rate.
    const w = weeksOf([], '2026-09-18')[0];
    expect(w.goalCents).toBe(187_500);
    expect(w.goalCents).toBeLessThan(SPRINT_DAILY_CENTS * 7);
    expect(w.perDayCents).toBe(Math.ceil(187_500 / 7)); // 26,786
  });

  it('projects every future week from today, not from a running zero', () => {
    const weeks = weeksOf([], '2026-09-18');
    const last = weeks[weeks.length - 1];
    expect(last.goalCents).toBeLessThan(500_000);
    expect(last.perDayCents).toBe(weeks[1].perDayCents);
  });
});

describe('recalibration', () => {
  it('lowers later weeks when a week beats its goal', () => {
    const weeks = weeksOf([day('2026-09-18', 5000)], '2026-09-26'); // into week two
    expect(weeks[0].earnedCents).toBe(500_000);
    expect(weeks[0].state).toBe('met');
    expect(weeks[1].goalCents).toBeLessThan(weeks[0].goalCents);
  });

  it('raises later weeks when a week falls short', () => {
    const weeks = weeksOf([day('2026-09-18', 100)], '2026-09-26');
    expect(weeks[0].state).toBe('missed');
    expect(weeks[1].goalCents).toBeGreaterThan(weeks[0].goalCents);
  });

  it('spreads the shortfall over days remaining, not weeks remaining', () => {
    // Week one earns nothing; the whole $30,000 is spread across the 105 days
    // the estimate has left, then multiplied back up by this week's seven.
    const weeks = weeksOf([], '2026-09-26');
    expect(weeks[1].goalCents).toBe(Math.ceil((3_000_000 / 105) * 7));
  });

  it('never lets a mid-week earning move the current week goal', () => {
    const before = weeksOf([], '2026-09-20')[0].goalCents;
    const after = weeksOf([day('2026-09-20', 900)], '2026-09-20')[0].goalCents;
    expect(after).toBe(before);
  });

  it('drops later goals to zero once the target is passed', () => {
    const weeks = weeksOf([day('2026-09-18', 40000)], '2026-09-26');
    expect(weeks[1].goalCents).toBe(0);
    expect(weeks[1].perDayCents).toBe(0);
    expect(weeks[1].progress).toBeNull();
  });

  it('falls back to the flat rate once the estimate has run out', () => {
    // Nothing earned, day 80 of 59. There are no days left to spread over, so
    // the week asks for the flat rate rather than the entire outstanding balance.
    const weeks = weeksOf([], '2027-02-14');
    const overrun = weeks.find((w) => w.startDate > '2027-01-07')!;
    expect(overrun.goalCents).toBe(SPRINT_DAILY_CENTS * overrun.dayCount);
  });

  it('keeps the plan adding up to at least the target', () => {
    const total = weeksOf([], '2026-09-18').reduce((a, w) => a + w.goalCents, 0);
    expect(total).toBeGreaterThanOrEqual(3_000_000);
  });
});

describe('weeks and their days', () => {
  it('orders days from the sprint start day', () => {
    const w = weeksOf([], '2026-09-18')[0];
    expect(w.days[0].date).toBe('2026-09-18');
    expect(w.days[0].dayOfWeek).toBe(1);
    expect(w.days[6].date).toBe('2026-09-24');
  });

  it('separates a logged zero from a day with no row', () => {
    const w = weeksOf([day('2026-09-18', 0)], '2026-09-19')[0];
    expect(w.days[0].state).toBe('blank');
    expect(w.days[1].state).toBe('unlogged');
  });

  it('marks days past today as future whatever is logged', () => {
    const w = weeksOf([day('2026-09-23', 900)], '2026-09-19')[0];
    expect(w.days[5].state).toBe('future');
  });

  it('sums a week from its days, losses included', () => {
    const w = weeksOf([day('2026-09-18', 900), day('2026-09-19', -200)], '2026-09-24')[0];
    expect(w.earnedCents).toBe(70_000);
  });
});

describe('the current week', () => {
  it('finds the week today sits in and what is left of it', () => {
    const w = currentWeek(weeksOf([day('2026-09-18', 300)], '2026-09-20'), '2026-09-20')!;
    expect(w.index).toBe(1);
    expect(w.startDate).toBe('2026-09-18');
    expect(w.endDate).toBe('2026-09-24');
    expect(w.daysElapsed).toBe(3);
    expect(w.daysLeft).toBe(5);
    expect(w.remainingCents).toBe(187_500 - 30_000);
  });

  it('has elapsed and remaining both include today', () => {
    const w = currentWeek(weeksOf([], '2026-09-21'), '2026-09-21')!;
    expect(w.daysElapsed + w.daysLeft).toBe(8);
  });

  it('reads 1/7 gone on the first day and 7/7 on the last', () => {
    expect(currentWeek(weeksOf([], '2026-09-18'), '2026-09-18')!.timeProgress)
      .toBeCloseTo(1 / 7, 10);
    expect(currentWeek(weeksOf([], '2026-09-24'), '2026-09-24')!.timeProgress).toBe(1);
  });

  it('is null before the sprint opens', () => {
    const early: Sprint = { ...VANDROMME, started: '2026-12-01' };
    expect(currentWeek(weeksOf([], '2026-09-18', early), '2026-09-18')).toBeNull();
  });
});

describe('the daily rate', () => {
  it('does not move as the week is earned or as days pass', () => {
    const flat = weeksOf([], '2026-09-18')[0].perDayCents;
    expect(weeksOf([day('2026-09-18', 3000)], '2026-09-21')[0].perDayCents).toBe(flat);
    expect(weeksOf([], '2026-09-23')[0].perDayCents).toBe(flat);
  });

  it('follows the goal when the goal recalibrates between weeks', () => {
    const weeks = weeksOf([day('2026-09-18', 5000)], '2026-09-26');
    expect(weeks[1].perDayCents).toBe(Math.ceil(weeks[1].goalCents / 7));
    expect(weeks[1].perDayCents).toBeLessThan(weeks[0].perDayCents);
  });
});

describe('the week summary', () => {
  it('counts weeks met and missed once they close', () => {
    const days = [day('2026-09-18', 5000), day('2026-09-25', 1)];
    const today = '2026-10-03';
    const s = weekSummary(weeksOf(days, today), view(today, days));
    expect(s.weeksElapsed).toBe(2);
    expect(s.weeksMet).toBe(1);
    expect(s.weeksMissed).toBe(1);
  });

  it('does not judge the week in progress', () => {
    const s = weekSummary(weeksOf([], '2026-09-20'), view('2026-09-20'));
    expect(s.weeksElapsed).toBe(0);
    expect(s.weeksMissed).toBe(0);
    expect(s.currentWeekIndex).toBe(1);
  });

  it('reports the flat rate as $1,883 a week, whatever the target works out to', () => {
    expect(weekSummary(weeksOf([], '2026-09-18'), view('2026-09-18')).openingWeeklyCents)
      .toBe(188_300);
  });

  it('has no pace left once the sprint target is passed', () => {
    const days = [day('2026-09-18', 40000)];
    const s = weekSummary(weeksOf(days, '2026-09-20'), view('2026-09-20', days));
    expect(s.weeklyPaceCents).toBeNull();
  });

  it('is all zeros rather than NaN with no sprint at all', () => {
    const s = weekSummary([], null);
    expect(s.totalWeeks).toBe(0);
    expect(s.currentWeekIndex).toBeNull();
    expect(s.weeklyPaceCents).toBeNull();
  });
});
