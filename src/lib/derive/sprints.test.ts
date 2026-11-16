import { describe, it, expect } from 'vitest';
import { sprintViews, sprintsStatus, SPRINT_DAILY_CENTS, SPRINT_WEEK_CENTS } from './sprints';
import type { MissionDay, Sprint } from '../types';

let row = 1;
const day = (date: string, dollars: number): MissionDay =>
  ({ date, amountCents: Math.round(dollars * 100), row: row++ });

const sprint = (
  name: string, target: number, started: string | null, completed: string | null = null,
): Sprint => ({ index: 0, name, targetCents: target * 100, started, completed, row: 0 });

const withIndex = (ss: Sprint[]) => ss.map((s, i) => ({ ...s, index: i + 1, row: i + 2 }));
const views = (ss: Sprint[], days: MissionDay[], today: string) =>
  sprintViews(withIndex(ss), days, today);

describe('the estimate', () => {
  it('is the target in whole weeks, to the nearest', () => {
    const [v] = views([sprint('vandromme', 30000, '2026-09-18')], [], '2026-09-18');
    expect(SPRINT_DAILY_CENTS).toBe(26_900); // the index's shadow, per day
    expect(SPRINT_WEEK_CENTS).toBe(188_300);
    expect(v.estimatedWeeks).toBe(16); // 30000 / 1883 = 15.93
    expect(v.estimatedDays).toBe(112);
    expect(v.estimatedEnd).toBe('2027-01-07');
  });

  it('rounds up when the target lands past the half week', () => {
    // 20000 / 1883 = 10.62, so eleven weeks is the nearer fit.
    const [v] = views([sprint('a', 20000, '2026-09-18')], [], '2026-09-18');
    expect(v.estimatedWeeks).toBe(11);
    expect(v.estimatedDays).toBe(77);
  });

  it('keeps a short sprint sane, which rounding down did not', () => {
    // $7,000 is 3.72 weeks. Nearest gives four; rounding DOWN would give three
    // and a $333 daily bar — 24% above the standing rate for no reason.
    const [v] = views([sprint('lamens', 7000, '2026-09-19')], [], '2026-09-19');
    expect(v.estimatedWeeks).toBe(4);
    expect(v.estimatedDays).toBe(28);
    expect(v.estimatedEnd).toBe('2026-10-16');
    expect(v.weeklyCents).toBe(175_000);
  });

  it('stays within a day of the standing rate, on either side of it', () => {
    // Nearest means a sprint can sit just below the rate as well as above. The
    // slack is at most half a week spread across the window.
    for (const target of [5000, 7000, 12345, 20000, 30000, 96000]) {
      const [v] = views([sprint('a', target, '2026-09-18')], [], '2026-09-18');
      const implied = v.targetCents / v.estimatedDays;
      expect(Math.abs(implied - SPRINT_DAILY_CENTS)).toBeLessThan(SPRINT_DAILY_CENTS);
    }
  });

  it('floors at one week for a target the parser would have refused', () => {
    // Unreachable from the sheet — a target under one week is rejected there —
    // but the guard means a hand-built sprint can never estimate at zero days
    // and then divide by them.
    const [v] = views([sprint('tiny', 400, '2026-09-18')], [], '2026-09-18');
    expect(v.estimatedWeeks).toBe(1);
    expect(v.estimatedDays).toBe(7);
  });

  it('splits the target evenly across the weeks, and that is the bar', () => {
    const [v] = views([sprint('vandromme', 30000, '2026-09-18')], [], '2026-09-18');
    expect(v.weeklyCents).toBe(187_500); // $1,875 — $30,000 over sixteen weeks
    expect(v.weeklyCents * v.estimatedWeeks).toBe(v.targetCents);
  });

  it('rounds the weekly bar up when the target will not divide', () => {
    // $12,345 over seven weeks does not divide. Rounding up keeps the weeks
    // adding to at least the target rather than just under it.
    const [v] = views([sprint('a', 12345, '2026-09-18')], [], '2026-09-18');
    expect(v.estimatedWeeks).toBe(7);
    expect(v.weeklyCents * 7).toBeGreaterThanOrEqual(v.targetCents);
  });

  it('always lands the estimate a whole number of weeks out', () => {
    for (const target of [1883, 5000, 12345, 30000, 96000]) {
      const [v] = views([sprint('a', target, '2026-09-18')], [], '2026-09-18');
      expect(v.estimatedDays % 7).toBe(0);
    }
  });

  it('does not move when the sprint runs late', () => {
    const early = views([sprint('a', 1024, '2026-09-18')], [], '2026-09-18')[0];
    const late = views([sprint('a', 1024, '2026-09-18')], [], '2026-12-01')[0];
    expect(late.estimatedEnd).toBe(early.estimatedEnd);
    expect(late.estimatedDays).toBe(early.estimatedDays);
  });
});

describe('earnings', () => {
  it('counts only the days inside the sprint window', () => {
    const days = [day('2026-09-17', 999), day('2026-09-18', 500), day('2026-09-19', 300)];
    const [v] = views([sprint('a', 30000, '2026-09-18')], days, '2026-09-19');
    expect(v.earnedCents).toBe(80_000); // the 17th is before it started
  });

  it('stops at the finish date, not at today', () => {
    const days = [day('2026-09-18', 500), day('2026-09-25', 400)];
    const [v] = views([sprint('a', 30000, '2026-09-18', '2026-09-20')], days, '2026-10-01');
    expect(v.earnedCents).toBe(50_000);
  });

  it('starts every sprint from zero, not from where the last one left off', () => {
    const days = [day('2026-09-18', 30000), day('2026-11-20', 100)];
    const vs = views([
      sprint('one', 30000, '2026-09-18', '2026-11-15'),
      sprint('two', 5000, '2026-11-16'),
    ], days, '2026-11-20');
    expect(vs[0].earnedCents).toBe(3_000_000);
    expect(vs[1].earnedCents).toBe(10_000);
  });

  it('lets losing days pull a sprint backwards', () => {
    const days = [day('2026-09-18', 900), day('2026-09-19', -400)];
    const [v] = views([sprint('a', 30000, '2026-09-18')], days, '2026-09-19');
    expect(v.earnedCents).toBe(50_000);
  });
});

describe('state', () => {
  it('is current for the first sprint without a logged finish', () => {
    const vs = views([
      sprint('one', 30000, '2026-09-18', '2026-11-15'),
      sprint('two', 5000, '2026-11-16'),
      sprint('three', 5000, '2026-12-01'),
    ], [], '2026-11-20');
    expect(vs.map((v) => v.state)).toEqual(['done', 'current', 'upcoming']);
  });

  it('is pending — not upcoming — when it is next but has not opened yet', () => {
    // The distinction that matters: this sprint IS the one being run. Calling
    // it 'upcoming' left the dashboard with nothing to show the day before a
    // sprint began.
    const [v] = views([sprint('a', 5000, '2026-12-01')], [], '2026-11-20');
    expect(v.state).toBe('pending');
    expect(v.earnedCents).toBe(0);
    expect(v.daysElapsed).toBe(0);
  });

  it('counts the whole estimate as still to come before it opens', () => {
    const [v] = views([sprint('a', 7000, '2026-09-19')], [], '2026-09-18');
    expect(v.daysLeft).toBe(28);
    expect(v.paceCents).toBe(0);
    expect(v.aheadCents).toBe(0);
  });

  it('hands a pending sprint to the dashboard as the current one', () => {
    // lamens, added the day before it starts.
    const st = sprintsStatus(views([sprint('lamens', 7000, '2026-09-19')], [], '2026-09-18'));
    expect(st.current).not.toBeNull();
    expect(st.current!.name).toBe('lamens');
    expect(st.current!.state).toBe('pending');
  });

  it('still queues the ones behind it', () => {
    const vs = views([
      sprint('lamens', 7000, '2026-09-19'),
      sprint('next', 7000, '2026-10-03'),
    ], [], '2026-09-18');
    expect(vs.map((v) => v.state)).toEqual(['pending', 'upcoming']);
  });

  it('is reached — not done — when earnings pass the target', () => {
    // Finishing is a decision. The number crossing is only a prompt.
    const days = [day('2026-09-18', 30000)];
    const [v] = views([sprint('a', 30000, '2026-09-18')], days, '2026-09-18');
    expect(v.state).toBe('reached');
    expect(v.completed).toBeNull();
    expect(v.remainingCents).toBe(0);
  });

  it('keeps counting a reached sprint until the date is logged', () => {
    const days = [day('2026-09-18', 30000), day('2026-09-19', 700)];
    const [v] = views([sprint('a', 30000, '2026-09-18')], days, '2026-09-19');
    expect(v.earnedCents).toBe(3_070_000);
    expect(v.progress).toBeGreaterThan(1);
  });

  it('queues a second unfinished sprint rather than running two at once', () => {
    const vs = views([
      sprint('one', 30000, '2026-09-18'),
      sprint('two', 5000, '2026-09-19'),
    ], [], '2026-10-01');
    expect(vs.map((v) => v.state)).toEqual(['current', 'upcoming']);
    expect(sprintsStatus(vs).current!.name).toBe('one');
  });
});

describe('the chain', () => {
  it('starts a blank-dated sprint the day after the one above finished', () => {
    const vs = views([
      sprint('one', 7000, '2026-09-19', '2026-10-02'),
      sprint('two', 7000, null),
    ], [], '2026-10-05');
    expect(vs[1].started).toBe('2026-10-03');
    expect(vs[1].state).toBe('current');
  });

  it('does not care which weekday that lands on', () => {
    // Sat 19 Sep finishing Tue 6 Oct puts the next sprint on a Wednesday, and
    // a three-week sprint then runs Wed-to-Tue.
    const vs = views([
      sprint('one', 7000, '2026-09-19', '2026-10-06'),
      sprint('two', 9000, null),
    ], [], '2026-10-10');
    expect(vs[1].started).toBe('2026-10-07'); // a Wednesday
    expect(vs[1].estimatedWeeks).toBe(5);
    expect(vs[1].estimatedEnd).toBe('2026-11-10'); // a Tuesday
  });

  it('chains along a whole run of sprints', () => {
    const vs = views([
      sprint('one', 7000, '2026-09-19', '2026-10-02'),
      sprint('two', 7000, null, '2026-10-20'),
      sprint('three', 7000, null),
    ], [], '2026-10-25');
    expect(vs.map((v) => v.started)).toEqual(['2026-09-19', '2026-10-03', '2026-10-21']);
  });

  it('lets a typed start date win over the chain', () => {
    const vs = views([
      sprint('one', 7000, '2026-09-19', '2026-10-02'),
      sprint('two', 7000, '2026-10-10'),
    ], [], '2026-10-12');
    expect(vs[1].started).toBe('2026-10-10');
  });

  it('is waiting, not upcoming, while the sprint above is unfinished', () => {
    // Its start cannot be known yet, so it does not invent one.
    const vs = views([
      sprint('one', 7000, '2026-09-19'),
      sprint('two', 7000, null),
    ], [], '2026-10-05');
    expect(vs[1].state).toBe('waiting');
    expect(vs[1].started).toBeNull();
    expect(vs[1].estimatedEnd).toBeNull();
    expect(vs[1].earnedCents).toBe(0);
  });

  it('still knows a waiting sprint’s length, which needs only its target', () => {
    const vs = views([
      sprint('one', 7000, '2026-09-19'),
      sprint('two', 18000, null),
    ], [], '2026-10-05');
    expect(vs[1].estimatedWeeks).toBe(10); // 18000 / 1883 = 9.56
    expect(vs[1].weeklyCents).toBe(180_000);
  });

  it('hands the dashboard nothing when the first sprint has no start at all', () => {
    const st = sprintsStatus(views([sprint('one', 7000, null)], [], '2026-10-05'));
    expect(st.current).toBeNull();
  });

  it('keeps an undated sprint out of the finished table', () => {
    // A finished sprint with no derivable start is a sheet mistake; it is left
    // out rather than drawn with a blank date.
    const st = sprintsStatus(views([
      sprint('one', 7000, null, '2026-10-02'),
      sprint('two', 7000, '2026-10-03', '2026-10-20'),
    ], [], '2026-10-25'));
    expect(st.done.map((d) => d.name)).toEqual(['two']);
  });
});

describe('time taken', () => {
  it('is null while the sprint is still running', () => {
    const [v] = views([sprint('a', 30000, '2026-09-18')], [], '2026-10-01');
    expect(v.actualDays).toBeNull();
    expect(v.deltaDays).toBeNull();
  });

  it('counts both end days, so same-day start and finish is one day', () => {
    const [v] = views([sprint('a', 400, '2026-09-18', '2026-09-18')], [], '2026-10-01');
    expect(v.actualDays).toBe(1);
  });

  it('reads negative when the sprint finished early', () => {
    // 112 days estimated, finished on day 45.
    const [v] = views([sprint('a', 30000, '2026-09-18', '2026-11-01')], [], '2026-12-01');
    expect(v.actualDays).toBe(45);
    expect(v.deltaDays).toBe(-67);
  });

  it('reads positive when it ran over', () => {
    const [v] = views([sprint('a', 30000, '2026-09-18', '2027-02-01')], [], '2027-03-01');
    expect(v.actualDays).toBe(137);
    expect(v.deltaDays).toBe(25);
  });
});

describe('the sprint’s own rate', () => {
  it('is what each day of it earned on average', () => {
    // $2,100 over three days.
    const days = [day('2026-09-18', 900), day('2026-09-19', 700), day('2026-09-20', 500)];
    const [v] = views([sprint('a', 30000, '2026-09-18')], days, '2026-09-20');
    expect(v.daysElapsed).toBe(3);
    expect(v.dailyCents).toBe(210_000 / 3); // $700 a day
  });

  it('divides a finished sprint by the days it actually took, not the estimate', () => {
    // $30,000 earned, finished on day 45 of a 112-day estimate.
    const days = [day('2026-09-18', 30000)];
    const [v] = views([sprint('a', 30000, '2026-09-18', '2026-11-01')], days, '2026-12-01');
    expect(v.actualDays).toBe(45);
    expect(v.dailyCents).toBe(3_000_000 / 45); // $666.67 a day
  });

  it('is negative for a sprint that went backwards', () => {
    const days = [day('2026-09-18', -600)];
    const [v] = views([sprint('a', 30000, '2026-09-18')], days, '2026-09-19');
    expect(v.dailyCents).toBe(-60_000 / 2);
  });

  it('is null before the sprint opens', () => {
    const [v] = views([sprint('a', 30000, '2026-12-01')], [], '2026-11-01');
    expect(v.daysElapsed).toBe(0);
    expect(v.dailyCents).toBeNull();
  });
});

describe('the pace line', () => {
  it('is the target, straight-lined across the estimate', () => {
    const [v] = views([sprint('a', 30000, '2026-09-18')], [], '2026-09-20');
    expect(v.daysElapsed).toBe(3);
    expect(v.paceCents).toBe(Math.round((3_000_000 * 3) / 112)); // $803.57
  });

  it('is drawn from the target, not from the rate that sized the window', () => {
    // Ten weeks is a hair's rounding up from 9.99, so the bar sits just BELOW
    // the rate here — and it sat above it when the rate was $512. Which side
    // it falls on depends on the target, which is the whole point: the pace
    // line follows the bar, not the rate, or the card holds two standards at
    // once. Asserting inequality rather than a direction keeps this test
    // honest when the rate changes again.
    const [v] = views([sprint('a', 30000, '2026-09-18')], [], '2026-09-18');
    expect(v.paceCents).not.toBe(SPRINT_DAILY_CENTS);
    expect(v.paceCents).toBe(Math.round(v.targetCents / v.estimatedDays));
  });

  it('stops climbing once the estimate is passed', () => {
    // Day 150 of a 112-day estimate: the line sits at the target, not past it.
    const [v] = views([sprint('a', 30000, '2026-09-18')], [], '2027-02-14');
    expect(v.daysElapsed).toBe(150);
    expect(v.paceCents).toBe(3_000_000);
  });

  it('says how far ahead or behind the line you are', () => {
    const days = [day('2026-09-18', 2000)];
    const [v] = views([sprint('a', 30000, '2026-09-18')], days, '2026-09-18');
    expect(v.aheadCents).toBe(200_000 - Math.round(3_000_000 / 112));
  });

  it('lands exactly on the target on the last day of the estimate', () => {
    const [v] = views([sprint('a', 30000, '2026-09-18')], [], '2027-01-07');
    expect(v.daysElapsed).toBe(112);
    expect(v.paceCents).toBe(v.targetCents);
  });

  it('counts days left to the estimate, and never below zero', () => {
    expect(views([sprint('a', 30000, '2026-09-18')], [], '2026-09-18')[0].daysLeft).toBe(112);
    expect(views([sprint('a', 30000, '2026-09-18')], [], '2027-02-14')[0].daysLeft).toBe(0);
  });
});

describe('the running total', () => {
  it('sums what every sprint earned, finished and running', () => {
    const days = [day('2026-09-18', 30000), day('2026-11-20', 800)];
    const s = sprintsStatus(views([
      sprint('one', 30000, '2026-09-18', '2026-11-15'),
      sprint('two', 5000, '2026-11-16'),
    ], days, '2026-11-20'));
    expect(s.totalEarnedCents).toBe(3_080_000);
    expect(s.totalTargetCents).toBe(3_500_000);
    expect(s.completedCount).toBe(1);
  });

  it('lists finished sprints most recent first', () => {
    const s = sprintsStatus(views([
      sprint('one', 1000, '2026-09-18', '2026-09-20'),
      sprint('two', 1000, '2026-09-21', '2026-09-25'),
    ], [], '2026-10-01'));
    expect(s.done.map((d) => d.name)).toEqual(['two', 'one']);
  });

  it('averages how early or late finished sprints ran', () => {
    const s = sprintsStatus(views([
      sprint('one', 1024, '2026-09-18', '2026-09-18'), // est 7 days, took 1 → -6
      sprint('two', 1024, '2026-09-20', '2026-09-27'), // est 7 days, took 8 → +1
    ], [], '2026-10-01'));
    expect(s.averageDeltaDays).toBe(-2.5);
  });

  it('has no average and no current sprint when the sheet is empty', () => {
    const s = sprintsStatus(views([], [], '2026-09-18'));
    expect(s.current).toBeNull();
    expect(s.averageDeltaDays).toBeNull();
    expect(s.totalEarnedCents).toBe(0);
  });
});
