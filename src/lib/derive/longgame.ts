/**
 * The one number underneath all the sprints: $983,000.
 *
 * WHEN IT STARTS. On the first day of the first sprint, not on a date written
 * into the code. The decade is a measure of the ladder, so it begins when the
 * ladder does — and if the first sprint is replaced, the window moves with it.
 *
 * WHERE IT COMES FROM. Half a million dollars left in an S&P 500 index fund
 * for ten years, at the index's long-run average of roughly 10.5% nominal,
 * becomes about $1.36m. Inflation takes around 3% a year, so measured in
 * today's purchasing power that is a real return nearer 7% — about $983,000.
 *
 * So $983,000 is not an aspiration. It is the opportunity cost: what half a
 * million dollars would have become on its own, with no trades, no sprints and
 * no attention paid. Earning it by hand over the same ten years means the whole
 * enterprise broke even against doing nothing.
 *
 * That is the point of putting it at the bottom of the page rather than the
 * top. The sprints are where the work happens and where the week is decided;
 * this is the line that says whether the work was worth doing. Divided over
 * 3,655 days it comes to $269.01 a day, which is where the sprint rate comes
 * from — every sprint is sized against the market's shadow.
 *
 * WHAT COUNTS. The running total across every sprint, finished and current —
 * each sprint owns the days inside its own window, and this is the sum.
 *
 * Which means a day only counts if some sprint owned it. In principle a gap
 * between sprints would be invisible here while the clock kept running; in
 * practice sprints are chained, one starting the day after the last one
 * finished, so there are no gaps to lose. Chaining is retroactive too — a row
 * added late with a blank start date still picks up the days since — so the
 * two definitions ("what the sprints earned" and "what the decade earned")
 * stay the same number. The caption on the page says only the first, because
 * the difference never arises.
 */

import { addDays, daysBetween } from '../dates';
import { SPRINT_DAILY_CENTS } from './sprints';

/** $983,000 — ten years of 7% real on half a million. */
export const LONG_GAME_TARGET_CENTS = 98_300_000;

/**
 * 3,655 days — the first day the $269 line reaches the target.
 *
 * Derived rather than written down so the two can never disagree: change the
 * target or the rate and this follows.
 */
export const LONG_GAME_DAYS = Math.ceil(LONG_GAME_TARGET_CENTS / SPRINT_DAILY_CENTS);

export interface LongGameStatus {
  /**
   * The first day of the first sprint — the clock starts when the work does.
   *
   * Null until a sprint with a start date exists. Deliberately not a fixed
   * constant: a decade measured from a date nothing happened on would drift out
   * of step with the ladder it is supposed to be totting up. The cost is that
   * replacing the first sprint row moves the whole window, which is the right
   * trade while the ladder is still being rearranged.
   */
  startDate: string | null;
  endDate: string | null;
  targetCents: number;
  totalDays: number;

  started: boolean;
  /** Days gone, including today. Capped at the full run. */
  daysElapsed: number;
  /** Days still to come. Zero once the window closes. */
  daysLeft: number;
  /** 0..1, how much of the decade has gone. */
  timeProgress: number;

  /** Everything every sprint has earned. */
  earnedCents: number;
  remainingCents: number;
  /** earnedCents / target. Uncapped. */
  progress: number;
  achieved: boolean;

  /** Where a flat $269 a day would have you today. Stops at the target. */
  paceCents: number;
  /** earned − pace. Positive is ahead of the market's shadow. */
  aheadCents: number;

  /** What every remaining day must average to still land on time. Null if done. */
  requiredDailyCents: number | null;
  /** What each day has actually averaged so far. Null before day one. */
  actualDailyCents: number | null;
  /** Where today's pace lands the finish. Null until something is earned. */
  projectedEnd: string | null;
}

export function longGameStatus(
  earnedCents: number,
  today: string,
  startDate: string | null,
): LongGameStatus {
  const endDate = startDate ? addDays(startDate, LONG_GAME_DAYS - 1) : null;
  const started = startDate !== null && today >= startDate;
  const daysElapsed = !started || !startDate
    ? 0
    : Math.min(LONG_GAME_DAYS, daysBetween(startDate, today) + 1);
  const daysLeft = Math.max(0, LONG_GAME_DAYS - daysElapsed);

  const remainingCents = Math.max(0, LONG_GAME_TARGET_CENTS - earnedCents);
  const paceCents = Math.round((LONG_GAME_TARGET_CENTS * daysElapsed) / LONG_GAME_DAYS);

  // Only meaningful once a day has passed AND something has been earned;
  // dividing by zero days, or projecting from zero earnings, says nothing.
  const actualDailyCents = daysElapsed > 0 ? earnedCents / daysElapsed : null;
  const projectedEnd = startDate !== null && actualDailyCents !== null && actualDailyCents > 0
    ? addDays(startDate, Math.ceil(LONG_GAME_TARGET_CENTS / actualDailyCents) - 1)
    : null;

  return {
    startDate,
    endDate,
    targetCents: LONG_GAME_TARGET_CENTS,
    totalDays: LONG_GAME_DAYS,
    started,
    daysElapsed,
    daysLeft,
    timeProgress: daysElapsed / LONG_GAME_DAYS,
    earnedCents,
    remainingCents,
    progress: earnedCents / LONG_GAME_TARGET_CENTS,
    achieved: earnedCents >= LONG_GAME_TARGET_CENTS,
    paceCents,
    aheadCents: earnedCents - paceCents,
    requiredDailyCents: remainingCents > 0 && daysLeft > 0
      ? Math.ceil(remainingCents / daysLeft)
      : null,
    actualDailyCents,
    projectedEnd,
  };
}
