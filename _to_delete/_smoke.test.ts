import { it } from 'vitest';
import { sprintViews, sprintsStatus } from './sprints';
import { missionWeeks, currentWeek, weekSummary } from './mission';
import type { MissionDay } from '../types';

it('lamens, one day past its estimate', () => {
  const sprints = [{
    index: 1, name: 'lamens', targetCents: 900_000,
    started: '2026-09-19', completed: null, row: 2,
  }];
  // The three days we actually logged, so remaining is realistic.
  const days: MissionDay[] = [
    { date: '2026-09-19', amountCents: 62_096, row: 1 },
    { date: '2026-09-24', amountCents: -345_601, row: 2 },
    { date: '2026-09-25', amountCents: 84_182, row: 3 },
  ];
  const today = '2026-10-10';
  const s = sprintsStatus(sprintViews(sprints, days, today)).current!;
  const weeks = missionWeeks(days, today, s);
  const w = currentWeek(weeks, today)!;
  const sum = weekSummary(weeks, s);
  console.log('OUT ' + JSON.stringify({
    state: s.state, estEnd: s.estimatedEnd, estDays: s.estimatedDays,
    daysElapsed: s.daysElapsed, daysLeft: s.daysLeft,
    earned: s.earnedCents / 100, remaining: s.remainingCents / 100,
    pacePctOfTarget: +(s.paceCents / s.targetCents).toFixed(3),
    weeks: weeks.length,
    thisWeek: { i: w.index, span: [w.startDate, w.endDate], goal: w.goalCents / 100, perDay: w.perDayCents / 100 },
    weeklyPace: (sum.weeklyPaceCents ?? 0) / 100,
    overrunWeekGoals: weeks.filter((x) => x.startDate > '2026-10-09').map((x) => x.perDayCents / 100),
  }));
});
