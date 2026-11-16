/**
 * The week, inside whichever sprint is running.
 *
 * There is no long game any more. The thing being aimed at is the current
 * sprint, and the week is how it gets broken down: each week takes whatever is
 * left of the sprint, spreads it over the days the estimate has left, and asks
 * for this week's share of that.
 *
 * A WEEK'S GOAL IS FIXED THE MOMENT IT OPENS. Beat a week and next week's
 * number falls; miss one and it rises. But nothing moves under you mid-week —
 * the figure you were handed on the first day is the one you are judged against
 * on the last. Recalibration is a thing that happens between weeks, never
 * inside one.
 *
 * WEEKS ARE ANCHORED TO THE SPRINT'S START, not to the calendar. A sprint that
 * begins on a Friday has Friday-to-Thursday weeks; one that begins on a Tuesday
 * has Tuesday-to-Monday weeks. The alternative — fixed calendar weeks — would
 * open every sprint with a stub, and a three-day first week reporting a missed
 * goal is noise, not information.
 *
 * PAST THE ESTIMATE, the recalibration has nothing left to divide by, so the
 * weekly goal reverts to the flat rate: $269 a day, or whatever is left if that
 * is less. Spreading the remainder over zero days would ask for everything at
 * once, which is arithmetic rather than a plan.
 *
 * THERE IS NO STUB WEEK. A sprint's estimate is a whole number of weeks, so
 * every week inside it is seven days long and every weekly goal is comparable
 * to every other. Only an overrunning sprint can end mid-week, and by then the
 * flat rate is what is being asked for anyway.
 */

import type { MissionDay } from '../types';
import type { LiveSprint } from './sprints';
import { SPRINT_DAILY_CENTS } from './sprints';
import { addDays, daysBetween } from '../dates';

export type WeekState = 'met' | 'missed' | 'current' | 'future';
export type DayState = 'earned' | 'blank' | 'unlogged' | 'future';

export interface MissionDayCell {
  date: string;
  /** 1-based day within its week. 1 is whatever weekday the sprint began on. */
  dayOfWeek: number;
  amountCents: number | null;
  state: DayState;
}

export interface MissionWeek {
  /** 1-based within the sprint. */
  index: number;
  startDate: string;
  endDate: string;
  /** Days in this week. Seven, except a last week clipped by the estimate. */
  dayCount: number;
  /**
   * What this week needed, set when the week began: everything the sprint still
   * owed at that moment, spread over the days the estimate had left.
   */
  goalCents: number;
  earnedCents: number;
  /** Still to earn this week. Zero once the goal is met. */
  remainingCents: number;
  /** earnedCents / goalCents. Uncapped, and null for a goal of zero. */
  progress: number | null;
  /**
   * The daily rate this week was set at: the goal over its own day count, fixed
   * when the week opened.
   *
   * Deliberately NOT "what is left over the days that remain". A rate that
   * recalculates every day is a moving target — bank a good first day and the
   * last day's number drops, miss a day and it climbs, and the figure you were
   * given at the start is never the one you are judged against.
   */
  perDayCents: number;
  state: WeekState;
  days: MissionDayCell[];
}

export interface WeekView extends MissionWeek {
  /** Days of this week gone, including today. */
  daysElapsed: number;
  /** Days of this week still to come, including today. */
  daysLeft: number;
  /**
   * How much of the week has gone. 0..1.
   *
   * Today counts as elapsed, so this reads 1/7 on the first day and 7/7 on the
   * last — the week is never "0% gone" while you are standing in it.
   */
  timeProgress: number;
}

export interface WeekSummary {
  totalWeeks: number;
  /** 1-based index of the week today falls in. Null outside the sprint. */
  currentWeekIndex: number | null;
  /** Weeks that have closed. */
  weeksElapsed: number;
  /** Weeks with any day still to come, including the current one. */
  weeksRemaining: number;
  weeksMet: number;
  weeksMissed: number;
  /** The rate the sprint was estimated at: $269 x 7 = $1,883 a week. */
  openingWeeklyCents: number;
  /** What every week from here on must average. Null once there are none. */
  weeklyPaceCents: number | null;
}

/**
 * This week's share of what is left, by day.
 *
 * Rounded up — a goal that rounds down can be met while leaving you fractionally
 * short, and a sprint's worth of those add up.
 */
function share(remainingCents: number, daysLeft: number, daysThisWeek: number): number {
  if (remainingCents <= 0) return 0;
  // Past the estimate there is nothing to spread over. Ask for the standard
  // rate, or the remainder if that is smaller.
  if (daysLeft <= 0) return Math.min(remainingCents, SPRINT_DAILY_CENTS * daysThisWeek);
  return Math.max(0, Math.ceil((remainingCents / daysLeft) * daysThisWeek));
}

/**
 * The weeks of the sprint being run, each with the goal it was given.
 *
 * Built in order because each week's goal depends on every week before it.
 * That sequential dependency IS the recalibration: week N is handed whatever
 * the first N-1 weeks failed to earn, spread over the days that remain.
 *
 * The window runs to the estimate, or to today if the sprint has overrun it —
 * an overrunning sprint still needs weeks to live in.
 */
export function missionWeeks(
  days: MissionDay[],
  today: string,
  sprint: LiveSprint | null,
): MissionWeek[] {
  if (!sprint) return [];

  const byDate = new Map(days.map((d) => [d.date, d.amountCents]));

  // How far out the weeks need to reach: the estimate, or today if the sprint
  // has run past it.
  const horizon = sprint.completed
    ?? (today > sprint.estimatedEnd ? today : sprint.estimatedEnd);
  const weekCount = Math.ceil(Math.max(1, daysBetween(sprint.started, horizon) + 1) / 7);

  // Overrun weeks run their full seven days. Clipping the last week to today
  // instead made "this week" a one-day week that grew by a day each morning —
  // a goal of one day's rate, a chart with a single bar, and no week to
  // compare against the ones before it. Only a LOGGED FINISH clips a week,
  // because there the sprint genuinely stopped mid-week.
  //
  // The estimate is always a whole number of weeks, so this changes nothing
  // for a sprint still inside it.
  const lastDay = sprint.completed ?? addDays(sprint.started, weekCount * 7 - 1);

  const weeks: MissionWeek[] = [];
  let earnedBefore = 0;
  let daysBefore = 0;
  // Frozen at the first week that has not started yet, so every future week is
  // projected from the SAME position — today's — rather than from a running
  // total that keeps consuming days while earning nothing. Without it, the last
  // week of a sprint would be handed the entire outstanding balance.
  let projection: { remainingCents: number; daysLeft: number } | null = null;

  for (let i = 0; i < weekCount; i++) {
    const startDate = addDays(sprint.started, i * 7);
    const rawEnd = addDays(startDate, 6);
    const endDate = rawEnd > lastDay ? lastDay : rawEnd;
    const dayCount = daysBetween(startDate, endDate) + 1;

    if (startDate > today && projection === null) {
      projection = {
        remainingCents: sprint.targetCents - earnedBefore,
        daysLeft: sprint.estimatedDays - daysBefore,
      };
    }

    const goalCents = projection
      ? share(projection.remainingCents, projection.daysLeft, dayCount)
      : share(sprint.targetCents - earnedBefore, sprint.estimatedDays - daysBefore, dayCount);

    const cells: MissionDayCell[] = [];
    let earnedCents = 0;

    for (let d = 0; d < dayCount; d++) {
      const date = addDays(startDate, d);
      const amountCents = byDate.get(date) ?? null;
      if (amountCents !== null) earnedCents += amountCents;

      const state: DayState =
        date > today ? 'future'
          : amountCents === null ? 'unlogged'
            : amountCents === 0 ? 'blank' : 'earned';

      cells.push({ date, dayOfWeek: d + 1, amountCents, state });
    }

    const state: WeekState =
      today < startDate ? 'future'
        : today > endDate ? (earnedCents >= goalCents ? 'met' : 'missed')
          : 'current';

    weeks.push({
      index: i + 1,
      startDate,
      endDate,
      dayCount,
      goalCents,
      earnedCents,
      remainingCents: Math.max(0, goalCents - earnedCents),
      progress: goalCents > 0 ? earnedCents / goalCents : null,
      perDayCents: Math.ceil(goalCents / dayCount),
      state,
      days: cells,
    });

    earnedBefore += earnedCents;
    daysBefore += dayCount;
  }

  return weeks;
}

/** The week today sits in, with what is left of it. */
export function currentWeek(weeks: MissionWeek[], today: string): WeekView | null {
  const week = weeks.find((w) => today >= w.startDate && today <= w.endDate);
  if (!week) return null;

  const daysElapsed = daysBetween(week.startDate, today) + 1;
  return {
    ...week,
    daysElapsed,
    daysLeft: daysBetween(today, week.endDate) + 1,
    timeProgress: daysElapsed / week.dayCount,
  };
}

export function weekSummary(
  weeks: MissionWeek[],
  sprint: LiveSprint | null,
): WeekSummary {
  const current = weeks.find((w) => w.state === 'current') ?? null;
  const weeksElapsed = weeks.filter((w) => w.state === 'met' || w.state === 'missed').length;
  const weeksRemaining = weeks.length - weeksElapsed;

  return {
    totalWeeks: weeks.length,
    currentWeekIndex: current ? current.index : null,
    weeksElapsed,
    weeksRemaining,
    weeksMet: weeks.filter((w) => w.state === 'met').length,
    weeksMissed: weeks.filter((w) => w.state === 'missed').length,
    openingWeeklyCents: SPRINT_DAILY_CENTS * 7,
    // Includes the week in progress, so this is "from here on", not "after this
    // week" — which is what can still be acted on.
    weeklyPaceCents: sprint && weeksRemaining > 0 && sprint.remainingCents > 0
      ? share(sprint.remainingCents, sprint.daysLeft ?? 0, 7)
      : null,
  };
}
