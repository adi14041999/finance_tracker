/**
 * The mission: earn at least $464 on event contracts, on at least 512 days,
 * starting 7 August 2026.
 *
 * The numbers are chosen, not derived. 464 is a palindrome and a happy number.
 * 512 days from the start lands exactly on 31 December 2027. The start is the
 * day after Maayi's birthday. They are constants rather than settings because
 * they are a commitment — changing one should be a deliberate edit to this
 * file, not a control on a page.
 *
 * What is counted is DAYS CLEARED, not dollars. "$464 on at least 512 days" is
 * a promise about days, and money earned above the bar on a good day does not
 * buy back a day that fell short. The running total is shown alongside because
 * it is worth knowing, but it is never the score.
 */

import type { MissionDay } from '../types';
import { addDays, daysBetween } from '../dates';

export const MISSION_START = '2026-08-07';
export const MISSION_TARGET_DAYS = 512;
export const MISSION_BAR_CENTS = 46_400; // $464
/** 2027-12-31 — the window is exactly as long as the promise. */
export const MISSION_END = addDays(MISSION_START, MISSION_TARGET_DAYS - 1);
/**
 * $237,568 — what 512 days at $464 comes to, and where the running total
 * lands on 31 December 2027 if every day clears the bar.
 *
 * The days are the score and this is the consequence of keeping them. Worth
 * stating outright all the same: it is the number the whole thing is for, and
 * a page that only ever showed "37 / 512" would never say what that is worth.
 */
export const MISSION_TARGET_CENTS = MISSION_TARGET_DAYS * MISSION_BAR_CENTS;
/**
 * Where August 2026 stood when the mission began: -$22,800.
 *
 * Recorded because a starting point is the one piece of context a progress bar
 * can never recover later. The mission's own arithmetic ignores it — the 512
 * days and the $237,568 are counted from zero on 7 August, not netted against
 * this — but "we began from here" is the difference between a number and a
 * story, and in a year it will not be reconstructible from anything else.
 */
export const MISSION_OPENING_BALANCE_CENTS = -2_280_000;

export type DayState = 'cleared' | 'short' | 'unlogged' | 'future';

export interface MissionCell {
  date: string;
  /** 1-based position in the window. */
  index: number;
  amountCents: number | null;
  state: DayState;
}

export interface MissionStatus {
  startDate: string;
  endDate: string;
  barCents: number;
  targetDays: number;

  started: boolean;
  /** Days of the window gone by, capped at the total. */
  daysElapsed: number;
  daysRemaining: number;

  cleared: number;
  short: number;
  unlogged: number;

  /** Days cleared as a share of the 512 promised. 0..1. */
  progress: number;
  /**
   * Days gone by as a share of the window. 0..1.
   *
   * Distinct from `progress`, and the gap between them is the whole point: time
   * passes whether or not a day clears, so this only ever moves forward while
   * the other can stall. Ahead means cleared is keeping up with elapsed.
   */
  timeProgress: number;
  /** Cleared days still needed. */
  stillNeeded: number;
  /**
   * The best finish still available: 512 minus the days already short.
   *
   * The window is exactly as long as the target, so one short day puts a
   * perfect 512 out of reach — and a page that answered "impossible" for the
   * next five hundred days would be useless. This says what is still on the
   * table instead, which keeps the thing worth looking at after a bad day.
   */
  maxPossible: number;
  /** Still on for a clean sweep — no day has fallen short yet. */
  perfectStillOn: boolean;
  achieved: boolean;

  /** Consecutive cleared days ending at the most recent logged day. */
  currentStreak: number;
  longestStreak: number;

  /** Total earned across logged days in the window. */
  earnedCents: number;
  /** 512 x $464 = $237,568 — where the total lands if every day clears. */
  targetCents: number;
  /** Share of that total banked. 0..1+, uncapped: beating it is possible. */
  moneyProgress: number;
  /** Still to earn to reach $237,568. Zero once it is passed. */
  moneyRemainingCents: number;
  /** True once the dollar total is reached, whatever the day count. */
  moneyAchieved: boolean;
  bestCents: number | null;
}

function stateOf(amount: number | null, date: string, today: string): DayState {
  if (date > today) return 'future';
  if (amount === null) return 'unlogged';
  return amount >= MISSION_BAR_CENTS ? 'cleared' : 'short';
}

/**
 * One cell per day of the window, always all 512 of them.
 *
 * The whole window is generated rather than derived from the rows, so the shape
 * of the thing you signed up for is visible from day one instead of growing in
 * as you log it.
 */
export function missionCells(days: MissionDay[], today: string): MissionCell[] {
  const byDate = new Map(days.map((d) => [d.date, d.amountCents]));
  const cells: MissionCell[] = [];

  for (let i = 0; i < MISSION_TARGET_DAYS; i++) {
    const date = addDays(MISSION_START, i);
    const amountCents = byDate.get(date) ?? null;
    cells.push({ date, index: i + 1, amountCents, state: stateOf(amountCents, date, today) });
  }

  return cells;
}

export function missionStatus(cells: MissionCell[], today: string): MissionStatus {
  const started = today >= MISSION_START;
  const daysElapsed = !started
    ? 0
    : Math.min(MISSION_TARGET_DAYS, daysBetween(MISSION_START, today) + 1);
  const daysRemaining = MISSION_TARGET_DAYS - daysElapsed;

  const cleared = cells.filter((c) => c.state === 'cleared').length;
  const short = cells.filter((c) => c.state === 'short').length;
  const unlogged = cells.filter((c) => c.state === 'unlogged').length;

  // Streaks run over days that have actually happened. An unlogged day breaks
  // a streak rather than being skipped — the promise is about days kept, and a
  // day with no record is not a day kept.
  let longest = 0;
  let run = 0;
  let current = 0;
  for (const c of cells) {
    if (c.state === 'future') break;
    if (c.state === 'cleared') {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
    current = run;
  }

  const logged = cells.filter((c) => c.amountCents !== null);
  const earnedCents = logged.reduce((a, c) => a + (c.amountCents ?? 0), 0);
  const stillNeeded = Math.max(0, MISSION_TARGET_DAYS - cleared);

  return {
    startDate: MISSION_START,
    endDate: MISSION_END,
    barCents: MISSION_BAR_CENTS,
    targetDays: MISSION_TARGET_DAYS,
    started,
    daysElapsed,
    daysRemaining,
    cleared,
    short,
    unlogged,
    progress: cleared / MISSION_TARGET_DAYS,
    timeProgress: daysElapsed / MISSION_TARGET_DAYS,
    stillNeeded,
    maxPossible: MISSION_TARGET_DAYS - short,
    perfectStillOn: short === 0,
    achieved: cleared >= MISSION_TARGET_DAYS,
    currentStreak: current,
    longestStreak: longest,
    earnedCents,
    targetCents: MISSION_TARGET_CENTS,
    // Uncapped on purpose. Days cleared can never exceed 512, but dollars can
    // run past the target — and a bar quietly clamped at 100% would hide that.
    moneyProgress: earnedCents / MISSION_TARGET_CENTS,
    moneyRemainingCents: Math.max(0, MISSION_TARGET_CENTS - earnedCents),
    moneyAchieved: earnedCents >= MISSION_TARGET_CENTS,
    bestCents: logged.length ? Math.max(...logged.map((c) => c.amountCents ?? 0)) : null,
  };
}
