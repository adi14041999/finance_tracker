/**
 * The mission, in two horizons.
 *
 * THE LONG GAME is fixed: $256 a day from 17 August 2026 to 30 December 2029.
 * That is 1,232 days and $315,392. It never moves. It is the thing being aimed
 * at.
 *
 * 31 December 2029 is deliberately NOT in it. It is held back as a reserve —
 * a day that owes nothing, and is there if the last week needs rescuing.
 *
 * THE WEEK is not fixed. Each week runs Monday to Sunday, and its goal is
 * recomputed when the previous one closes: whatever is left of the $315,648,
 * spread over the days left to earn it, times the days in this week. Beat a
 * week and next week's number falls. Miss one and it rises. The long game
 * absorbs the difference either way, which is the whole point of splitting
 * them — a fixed weekly target would either drift out of contact with the goal
 * or quietly forgive a bad week, and this does neither.
 *
 * Holding that day back makes the window exactly 176 Monday-to-Sunday weeks
 * with nothing left over — 17 August 2026 is a Monday and 30 December 2029 is
 * a Sunday. Recalibration still spreads by DAY rather than by week, which
 * keeps the arithmetic honest if the window ever changes shape again.
 */

import type { MissionDay } from '../types';
import { addDays, daysBetween } from '../dates';

/** A Monday. */
export const MISSION_START = '2026-08-17';
/** A Sunday — the last day that owes anything. */
export const MISSION_END = '2029-12-30';
/**
 * 31 December 2029: a spare. It sits outside the mission, owes nothing, and
 * exists so the final week has somewhere to go if it needs rescuing.
 */
export const MISSION_RESERVE_DAY = '2029-12-31';
export const MISSION_DAYS = daysBetween(MISSION_START, MISSION_END) + 1; // 1232
/** 176 whole Monday-to-Sunday weeks, with nothing left over. */
export const MISSION_WEEKS = Math.ceil(MISSION_DAYS / 7); // 176
/** $256 a day, every day, for the whole run. */
export const MISSION_DAILY_CENTS = 25_600;
/** $315,392 — 1,232 days at $256. The one figure in here that never changes. */
export const MISSION_TARGET_CENTS = MISSION_DAYS * MISSION_DAILY_CENTS;

export type WeekState = 'met' | 'missed' | 'current' | 'future';
export type DayState = 'earned' | 'blank' | 'unlogged' | 'future';

export interface MissionDayCell {
  date: string;
  /** 1-based day within its week, 1 = Saturday. */
  dayOfWeek: number;
  amountCents: number | null;
  state: DayState;
}

export interface MissionWeek {
  /** 1-based, 1..176. */
  index: number;
  startDate: string; // Monday
  endDate: string; // Sunday
  /** Days in this week. Seven for every week, given the window divides evenly. */
  dayCount: number;
  /**
   * What this week needed, set when the week began: everything still owed at
   * that moment, divided by the weeks then left. Fixed once the week starts.
   */
  goalCents: number;
  earnedCents: number;
  /** Still to earn this week. Zero once the goal is met. */
  remainingCents: number;
  /** earnedCents / goalCents. Uncapped, and null for a goal of zero. */
  progress: number | null;
  /**
   * The daily rate this week was set at: the goal divided by its own day count,
   * fixed when the week opened.
   *
   * Deliberately NOT "what is left over the days that remain". A rate that
   * recalculates every day is a moving target — bank a good Saturday and
   * Sunday's number drops, miss a day and it climbs, and the figure you were
   * given on Monday is never the one you are judged against. The week already
   * recalibrates against the long game; the days inside it should not.
   */
  perDayCents: number;
  state: WeekState;
  days: MissionDayCell[];
}

export interface WeekView extends MissionWeek {
  /** Days of this week gone, including today. 1 on the Monday, 7 on the Sunday. */
  daysElapsed: number;
  /** Days of this week still to come, including today. */
  daysLeft: number;
  /**
   * How much of the week has gone. 0..1.
   *
   * Today counts as elapsed, so this reads 1/7 on the Monday and 7/7 on the
   * Sunday — the week is never "0% gone" while you are standing in it.
   */
  timeProgress: number;
}

export interface MissionStatus {
  startDate: string;
  endDate: string;
  targetCents: number;
  totalWeeks: number;

  started: boolean;
  finished: boolean;

  /** Days of the whole window gone, including today. Capped at 1,232. */
  daysElapsed: number;
  /**
   * How much of the 1,232 days has gone. 0..1.
   *
   * The counterpart to `progress`, and the gap between them is the pace read:
   * time only ever moves forward, money can stall. Money bar ahead of the time
   * bar means you are running ahead of the clock.
   */
  timeProgress: number;

  /** Everything earned inside the window so far. */
  earnedCents: number;
  /** Still to earn to reach $315,392. Zero once it is passed. */
  remainingCents: number;
  /** earnedCents / targetCents. Uncapped: beating it is possible. */
  progress: number;
  achieved: boolean;

  /** 1-based index of the week today falls in. Null outside the window. */
  currentWeekIndex: number | null;
  weeksElapsed: number;
  /** Weeks with any day still to come, including the current one. */
  weeksRemaining: number;
  /** Completed weeks that hit their goal. */
  weeksMet: number;
  weeksMissed: number;

  /** The pace the whole thing opened at: $256 x 7 = $1,792 a week. */
  openingWeeklyCents: number;
  /**
   * What every remaining week must now average. The single most useful number
   * on the page — it says what the situation is, not what it was.
   */
  weeklyPaceCents: number | null;
}

/**
 * This week's share of what is left, by day.
 *
 * Rounded up — a goal that rounds down can be met while leaving you fractionally
 * short, and 176 of those add up.
 */
function share(remainingCents: number, daysLeft: number, daysThisWeek: number): number {
  if (daysLeft <= 0) return 0;
  return Math.max(0, Math.ceil((remainingCents / daysLeft) * daysThisWeek));
}

/**
 * All 176 weeks, each with the goal it was given and what it earned.
 *
 * Built in order because each week's goal depends on every week before it.
 * That sequential dependency is the recalibration: week N is handed whatever
 * the first N-1 weeks failed to earn, spread over the days that remain.
 */
export function missionWeeks(days: MissionDay[], today: string): MissionWeek[] {
  const byDate = new Map(days.map((d) => [d.date, d.amountCents]));
  const weeks: MissionWeek[] = [];

  let earnedBefore = 0;
  let daysBefore = 0;
  // Frozen at the first week that has not started yet. Every future week is
  // projected from the SAME position — today's — rather than from a running
  // total that keeps consuming days while earning nothing. Without this, a
  // week two years out would be handed the entire outstanding balance and
  // shown a goal of six figures, which is arithmetic, not information.
  let projection: { remainingCents: number; daysLeft: number } | null = null;

  for (let i = 0; i < MISSION_WEEKS; i++) {
    const startDate = addDays(MISSION_START, i * 7);
    // Clipped to the mission end. With the reserve day held back the window
    // divides evenly, so this never fires — it stays as a guard against a
    // future change of dates silently running a week past the finish.
    const rawEnd = addDays(startDate, 6);
    const endDate = rawEnd > MISSION_END ? MISSION_END : rawEnd;
    const dayCount = daysBetween(startDate, endDate) + 1;

    // Set from the position at the START of this week, so a goal never shifts
    // under you mid-week. Today's earnings change next week's number, not this
    // week's — you always know what you are chasing.
    if (startDate > today && projection === null) {
      projection = {
        remainingCents: MISSION_TARGET_CENTS - earnedBefore,
        daysLeft: MISSION_DAYS - daysBefore,
      };
    }

    const goalCents = projection
      ? share(projection.remainingCents, projection.daysLeft, dayCount)
      : share(MISSION_TARGET_CENTS - earnedBefore, MISSION_DAYS - daysBefore, dayCount);

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

  const daysLeft = daysBetween(today, week.endDate) + 1;
  const daysElapsed = daysBetween(week.startDate, today) + 1;
  return {
    ...week,
    daysElapsed,
    daysLeft,
    timeProgress: daysElapsed / week.dayCount,
  };
}

export function missionStatus(weeks: MissionWeek[], today: string): MissionStatus {
  const started = today >= MISSION_START;
  const finished = today > MISSION_END;

  const earnedCents = weeks.reduce((a, w) => a + w.earnedCents, 0);
  const remainingCents = Math.max(0, MISSION_TARGET_CENTS - earnedCents);

  const current = weeks.find((w) => w.state === 'current') ?? null;
  const daysElapsed = !started
    ? 0
    : Math.min(MISSION_DAYS, daysBetween(MISSION_START, today) + 1);
  const weeksElapsed = weeks.filter((w) => w.state === 'met' || w.state === 'missed').length;
  const weeksRemaining = MISSION_WEEKS - weeksElapsed;

  return {
    startDate: MISSION_START,
    endDate: MISSION_END,
    targetCents: MISSION_TARGET_CENTS,
    totalWeeks: MISSION_WEEKS,
    started,
    finished,
    daysElapsed,
    timeProgress: daysElapsed / MISSION_DAYS,
    earnedCents,
    remainingCents,
    progress: earnedCents / MISSION_TARGET_CENTS,
    achieved: earnedCents >= MISSION_TARGET_CENTS,
    currentWeekIndex: current ? current.index : null,
    weeksElapsed,
    weeksRemaining,
    weeksMet: weeks.filter((w) => w.state === 'met').length,
    weeksMissed: weeks.filter((w) => w.state === 'missed').length,
    openingWeeklyCents: MISSION_DAILY_CENTS * 7,
    // Includes the week in progress, so this is "from here on", not "after
    // this week" — which is what you can still act on.
    weeklyPaceCents: weeksRemaining > 0
      ? share(remainingCents, MISSION_DAYS - daysElapsed + 1, 7)
      : null,
  };
}
