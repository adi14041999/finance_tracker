/**
 * Sprints: the mission as a ladder of medium targets rather than one long haul.
 *
 * A sprint has a name, an amount, a start date, and a finish date you type in
 * yourself. Each one counts FROM ZERO over its own window — its earnings are
 * the mission days inside it, not a slice of some grand total. That is what
 * makes a sprint feel like a sprint: finishing one puts the counter back to
 * nothing and starts a new thing, instead of nudging a bar that has two years
 * left in it.
 *
 * What survives across sprints is the running total, which is simply the sum of
 * what every sprint earned. It is a record of distance covered, not a target,
 * and nothing recalibrates against it.
 *
 * THE ESTIMATE is deliberately naive: target divided by $1,883 a week — seven
 * days at $269 — rounded to the NEAREST whole week. It does not learn from how
 * the last sprint went and it does not move when you fall behind. Its whole
 * value is being a fixed thing to be measured against — once you log the finish
 * date, the difference between estimated and actual is the only honest read on
 * how the sprint actually went.
 *
 * Whole weeks, not whole days, because the week is the unit everything else is
 * measured in. A window of 59 days is eight weeks and a three-day stub, and a
 * stub week reporting a missed goal against a three-sevenths target is noise.
 *
 * NEAREST rather than down, because rounding down is gentle on long sprints and
 * brutal on short ones. The fraction dropped is the same either way, but as a
 * share of the window it grows as the window shrinks: 8.37 weeks cut to 8 is a
 * 4% squeeze, while 1.95 weeks cut to 1 nearly doubles the daily bar. Nearest
 * keeps the implied rate as close to the standing one as whole weeks allow,
 * whichever side it falls.
 *
 * The consequence is that a sprint can sit slightly below the standing rate as
 * well as above it, which is the honest price of a window measured in weeks.
 *
 * The target itself is never adjusted to fit. It is the one number nothing in
 * here is allowed to move.
 *
 * SPRINTS RUN BACK TO BACK. One starts the day after the one before it
 * finished, whatever weekday that lands on — a sprint can perfectly well be
 * three weeks of Wednesday-to-Tuesday. So a blank start date is derived from
 * the row above rather than being an error: the only start that has to be typed
 * is the first one. A date typed in anyway wins, and is checked against the
 * chain so a gap or an overlap gets named instead of passing quietly.
 *
 * A sprint whose predecessor has not finished has no knowable start, and says
 * so ('waiting') rather than inventing one. Only the sprint being run and the
 * ones already done have dates worth drawing.
 *
 * FINISHING IS A DECISION, not a threshold. Earnings can pass the target
 * without the sprint being over — a target is rarely only about the number —
 * so crossing it is reported and the sprint keeps running until you write the
 * date in. The state for that is 'reached'.
 */

import type { MissionDay, Sprint } from '../types';
import { addDays, daysBetween } from '../dates';

/**
 * $269 a day. The rate every estimate is drawn from.
 *
 * WHY 269, and this one is not a numerology joke. It is the rate at which this
 * mission matches the stock market.
 *
 * Half a million dollars left in an S&P 500 index fund for ten years, at the
 * index's long-run average of about 10.5% nominal, becomes roughly $1.36m. But
 * inflation takes about 3% of that a year, so in today's money — what it would
 * actually buy — it is closer to a 7% real return, or $983,000. Earning
 * $983,000 by hand over the same ten years therefore leaves you exactly where
 * doing nothing with $500,000 would have.
 *
 * $983,000 over 3,655 days is $269.01 a day. So $269 is the answer to "what
 * does this have to be worth per day to be worth doing at all?" — the hourly
 * wage of the whole enterprise, measured against the laziest possible
 * alternative. Every sprint is sized against that bar.
 *
 * It is a pleasant number besides: prime, twin with 271, and the sum of two
 * squares (10^2 + 13^2).
 *
 * The rate's whole job is choosing how many WHOLE WEEKS a target is spread
 * over, plus the overrun fallback. Its predecessors ($464, $512, $256, $612,
 * $1,430, $401, $412, $429, $365) were picked for how they sounded, and each
 * lasted days. This one is picked for what it means.
 */
export const SPRINT_DAILY_CENTS = 26_900;

/** $1,883 — seven days at $269. Estimates are cut to whole multiples of this. */
export const SPRINT_WEEK_CENTS = SPRINT_DAILY_CENTS * 7;

export type SprintState =
  /** Finished, with a date logged. */
  | 'done'
  /** Running, and past its target — waiting on you to log the date. */
  | 'reached'
  /** Running. */
  | 'current'
  /**
   * The one being run, but not started yet — its start date is in the future.
   *
   * Distinct from 'upcoming' because this sprint IS the active one: its weeks
   * are already settled and week one's goal can be shown before it opens.
   * Collapsing the two meant a sprint starting tomorrow left the dashboard
   * reporting nothing at all.
   */
  | 'pending'
  /** Queued behind the one that is running, with a start date of its own. */
  | 'upcoming'
  /**
   * Queued, and not yet datable: the sprint above it has no finish date, so
   * the day this one begins is not yet knowable.
   */
  | 'waiting';

export interface SprintView {
  index: number;
  name: string;
  targetCents: number;
  /**
   * The day it begins — typed in the sheet, or the day after the sprint above
   * it finished. Null only while that predecessor is still running.
   */
  started: string | null;
  completed: string | null;
  row: number;
  state: SprintState;

  /** Everything the mission log holds inside this sprint's window. */
  earnedCents: number;
  /** Still to earn. Zero once the target is passed. */
  remainingCents: number;
  /** earnedCents / targetCents. Uncapped — beating a target is possible. */
  progress: number;

  /** The estimate in whole weeks: target / $1,883, to the nearest. Never moves. */
  estimatedWeeks: number;
  /** estimatedWeeks x 7. Always a whole number of weeks. */
  estimatedDays: number;
  /**
   * The target split evenly across the weeks of the estimate.
   *
   * This is the bar, and it is what the card should name. The daily rate only
   * ever sized the window; once the window exists the target is what gets
   * divided up, and quoting the rate instead would name a number nobody is
   * asked for.
   */
  weeklyCents: number;
  /** The day the estimate lands on. Null until the start is known. */
  estimatedEnd: string | null;
  /** Days taken, start and finish inclusive. Null until the finish is logged. */
  actualDays: number | null;
  /** actual − estimated. Negative is early. Null until the finish is logged. */
  deltaDays: number | null;

  /** Days gone, including today. For a finished sprint this is actualDays. */
  daysElapsed: number;
  /** Days to the estimate, including today. Null once finished. */
  daysLeft: number | null;

  /**
   * The straight line from nothing to the target across the estimate, at today.
   *
   * Drawn from the SPRINT's own bar, not from the daily rate that sized the
   * window. The two are not the same number — the estimate rounds down, so the
   * bar always sits a little above the rate — and measuring against the rate
   * while being set the bar is two different standards in one card.
   */
  paceCents: number;
  /** earned − pace. Positive is ahead of the line. */
  aheadCents: number;

  /**
   * What each day of this sprint actually earned, on average.
   *
   * For a finished sprint this is the sprint's verdict in one number: what it
   * was worth per day, which is the only figure comparable across sprints of
   * different sizes and lengths. For a running one it is the pace so far.
   *
   * Null before the sprint opens, because dividing by no days says nothing.
   */
  dailyCents: number | null;
}

/**
 * A sprint whose dates are known.
 *
 * Everything the dashboard draws needs a start date, and a sprint waiting on an
 * unfinished predecessor has none. Narrowing it here means the components never
 * carry a null check for a case they cannot be handed.
 */
export interface LiveSprint extends SprintView {
  started: string;
  estimatedEnd: string;
}

function isLive(v: SprintView): v is LiveSprint {
  return v.started !== null && v.estimatedEnd !== null;
}

export interface SprintsStatus {
  all: SprintView[];
  /** The one being run: the first without a logged finish, started or not. */
  current: LiveSprint | null;
  /** Finished, most recent first. */
  done: LiveSprint[];
  /** The sum of what every sprint earned — the distance covered. */
  totalEarnedCents: number;
  /** Every target added up, finished and unfinished. */
  totalTargetCents: number;
  completedCount: number;
  /** Across finished sprints only. Negative means finishing early on average. */
  averageDeltaDays: number | null;
  /**
   * The first day of the first sprint, in sheet order — where the long game's
   * clock starts. Null until some sprint has a start date.
   *
   * Sheet order rather than the earliest date, because the first ROW is what
   * "the first sprint" means; a row added later with an earlier date is a
   * mistake, not a new beginning.
   */
  firstStarted: string | null;
}

/** What the mission log holds between two dates, inclusive. */
function earnedBetween(days: MissionDay[], from: string, to: string): number {
  if (to < from) return 0;
  let total = 0;
  for (const d of days) {
    if (d.date >= from && d.date <= to) total += d.amountCents;
  }
  return total;
}

/**
 * Every sprint, in sheet order, with what it earned and how it is going.
 *
 * Order matters and is not sorted: the sheet's order is the order they are run
 * in. The first row without a finish date is the one being run, and everything
 * after it is queued — even if its start date has already passed, because two
 * sprints running at once is a sheet mistake, not a plan.
 */
export function sprintViews(
  sprints: Sprint[],
  days: MissionDay[],
  today: string,
): SprintView[] {
  let activeSeen = false;
  // The finish date of the row above. The next sprint starts the day after it.
  let prevCompleted: string | null = null;

  return sprints.map((s) => {
    const started = s.started ?? (prevCompleted ? addDays(prevCompleted, 1) : null);
    prevCompleted = s.completed;

    // Nearest whole week. The floor of one is unreachable from the sheet — the
    // parser refuses a target under a week — and exists so a sprint built in a
    // test or by hand can never estimate at zero days and then divide by them.
    // It needs only the target, so it is known even before the start date is.
    const estimatedWeeks = Math.max(1, Math.round(s.targetCents / SPRINT_WEEK_CENTS));
    const estimatedDays = estimatedWeeks * 7;
    const estimatedEnd = started ? addDays(started, estimatedDays - 1) : null;

    const windowEnd = s.completed ?? today;
    const earnedCents = started ? earnedBetween(days, started, windowEnd) : 0;
    const remainingCents = Math.max(0, s.targetCents - earnedCents);
    const progress = earnedCents / s.targetCents;

    const actualDays = s.completed && started ? daysBetween(started, s.completed) + 1 : null;
    const deltaDays = actualDays === null ? null : actualDays - estimatedDays;

    // The active sprint is the first WITHOUT a finish date, whether or not it
    // has started. Only sprints queued behind that one are 'upcoming'. One
    // whose start cannot yet be known — because the sprint above it is still
    // running — is 'waiting', and says so rather than inventing a date.
    let state: SprintState;
    if (s.completed) {
      state = 'done';
    } else if (activeSeen) {
      state = started ? 'upcoming' : 'waiting';
    } else if (!started) {
      state = 'waiting';
    } else {
      activeSeen = true;
      state = started > today ? 'pending'
        : remainingCents === 0 ? 'reached' : 'current';
    }

    const daysElapsed = actualDays
      ?? (!started || today < started ? 0 : daysBetween(started, today) + 1);
    // Before it opens, the whole estimate is still to come — counting from
    // today would include days that are not part of the sprint at all.
    const daysLeft = s.completed ? null
      : !started || today < started ? estimatedDays
        : Math.max(0, daysBetween(today, estimatedEnd!) + 1);

    // The pace line stops at the estimate: past it the line sits at the target,
    // because there is nothing above the target to be on pace for.
    const paceCents = Math.round(
      (s.targetCents * Math.min(daysElapsed, estimatedDays)) / estimatedDays,
    );

    return {
      index: s.index,
      name: s.name,
      targetCents: s.targetCents,
      started,
      completed: s.completed,
      row: s.row,
      state,
      earnedCents,
      remainingCents,
      progress,
      estimatedWeeks,
      estimatedDays,
      estimatedEnd,
      weeklyCents: Math.ceil(s.targetCents / estimatedWeeks),
      actualDays,
      deltaDays,
      daysElapsed,
      daysLeft,
      paceCents,
      aheadCents: earnedCents - paceCents,
      dailyCents: daysElapsed > 0 ? earnedCents / daysElapsed : null,
    };
  });
}

export function sprintsStatus(views: SprintView[]): SprintsStatus {
  // The sprint being run must have a start date; a 'waiting' one has nothing
  // to draw and nothing to recalibrate against.
  const dated = views.filter(isLive);
  const current = dated.find(
    (v) => v.state === 'current' || v.state === 'reached' || v.state === 'pending',
  ) ?? null;
  const done = dated.filter((v) => v.state === 'done').slice().reverse();

  const deltas = done.map((d) => d.deltaDays).filter((d): d is number => d !== null);

  return {
    all: views,
    current,
    done,
    totalEarnedCents: views.reduce((a, v) => a + v.earnedCents, 0),
    totalTargetCents: views.reduce((a, v) => a + v.targetCents, 0),
    completedCount: done.length,
    averageDeltaDays: deltas.length
      ? deltas.reduce((a, d) => a + d, 0) / deltas.length
      : null,
    firstStarted: views.find((v) => v.started !== null)?.started ?? null,
  };
}
