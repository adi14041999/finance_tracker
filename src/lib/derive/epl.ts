/**
 * The Premier League mission: $50 a game, every game of the 2026-27 season.
 *
 * Twenty clubs playing each other home and away is 380 fixtures, and at $50
 * apiece that is $19,000.
 *
 * The season is the clock here, not the calendar. A fortnight of international
 * break has no fixtures in it, so a date-based pace line would read as falling
 * behind when there was nothing there to earn from. What you should have banked
 * by now is $50 times the games actually PLAYED, and the gap between that and
 * what you did bank is the whole story.
 *
 * A fixture with no amount logged has not been played. A fixture logged at zero
 * has been played and brought nothing. Those are different facts and are never
 * collapsed — one is the season not having happened yet, the other is a result.
 */

import type { EplFixture } from '../types';

/** 20 clubs, home and away: 20 x 19 = 380. */
export const EPL_GAMES = 380;
export const EPL_PER_GAME_CENTS = 5_000; // $50
/** $19,000 — 380 games at $50. */
export const EPL_TARGET_CENTS = EPL_GAMES * EPL_PER_GAME_CENTS;
export const EPL_SEASON = '2026-27';

export type FixtureState = 'cleared' | 'short' | 'unplayed';

export interface EplRow extends EplFixture {
  state: FixtureState;
  /** Amount minus the $50 bar. Null when not yet played. */
  deltaCents: number | null;
}

export interface EplStatus {
  season: string;
  totalGames: number;
  perGameCents: number;
  targetCents: number;

  /** Fixtures listed in the sheet. Should be 380; says so when it isn't. */
  listed: number;
  played: number;
  gamesLeft: number;
  cleared: number;
  short: number;
  /** Games played as a share of the season. 0..1. */
  seasonProgress: number;

  earnedCents: number;
  remainingCents: number;
  /** Earned as a share of the target. 0..1+, uncapped. */
  moneyProgress: number;
  achieved: boolean;

  /** What $50 a game would have paid across the fixtures already played. */
  expectedCents: number;
  /** Earned minus expected. Positive is ahead of the bar. */
  aheadCents: number;
  onTrack: boolean;

  /** Average across every game played. Null before the first fixture. */
  averagePerGameCents: number | null;
  /** What each remaining game must now bring. Null once the season ends. */
  neededPerGameCents: number | null;

  bestCents: number | null;
  /** The next fixture with nothing logged against it. */
  next: EplRow | null;
  started: boolean;
}

export function eplRows(fixtures: EplFixture[]): EplRow[] {
  return fixtures.map((f) => ({
    ...f,
    state: f.amountCents === null
      ? 'unplayed'
      : f.amountCents >= EPL_PER_GAME_CENTS ? 'cleared' : 'short',
    deltaCents: f.amountCents === null ? null : f.amountCents - EPL_PER_GAME_CENTS,
  }));
}

export function eplStatus(rows: EplRow[]): EplStatus {
  const playedRows = rows.filter((r) => r.amountCents !== null);
  const played = playedRows.length;
  const earnedCents = playedRows.reduce((a, r) => a + (r.amountCents ?? 0), 0);

  // Against the season's true length, not the sheet's — a fixture list that is
  // short by ten rows must not quietly shrink the target.
  const gamesLeft = Math.max(0, EPL_GAMES - played);
  const remainingCents = Math.max(0, EPL_TARGET_CENTS - earnedCents);
  const expectedCents = played * EPL_PER_GAME_CENTS;

  return {
    season: EPL_SEASON,
    totalGames: EPL_GAMES,
    perGameCents: EPL_PER_GAME_CENTS,
    targetCents: EPL_TARGET_CENTS,

    listed: rows.length,
    played,
    gamesLeft,
    cleared: rows.filter((r) => r.state === 'cleared').length,
    short: rows.filter((r) => r.state === 'short').length,
    seasonProgress: played / EPL_GAMES,

    earnedCents,
    remainingCents,
    // Uncapped: games played can never exceed 380, but dollars can run past
    // $19,000, and a clamped figure would hide that.
    moneyProgress: earnedCents / EPL_TARGET_CENTS,
    achieved: earnedCents >= EPL_TARGET_CENTS,

    expectedCents,
    aheadCents: earnedCents - expectedCents,
    onTrack: earnedCents >= expectedCents,

    averagePerGameCents: played > 0 ? Math.round(earnedCents / played) : null,
    neededPerGameCents: gamesLeft > 0 ? Math.ceil(remainingCents / gamesLeft) : null,

    bestCents: played > 0 ? Math.max(...playedRows.map((r) => r.amountCents ?? 0)) : null,
    next: rows.find((r) => r.state === 'unplayed') ?? null,
    started: played > 0,
  };
}

export interface EplMonth {
  /** YYYY-MM, or null for fixtures with no date yet. */
  month: string | null;
  fixtures: EplRow[];
  played: number;
  cleared: number;
  short: number;
  earnedCents: number;
  /** $50 times the games played in this month. */
  expectedCents: number;
  /** Earned minus expected, for this month alone. */
  aheadCents: number;
  /** True when every fixture in the month has been logged. */
  complete: boolean;
}

/**
 * Fixtures grouped by the month they are played in.
 *
 * Months are taken in first-appearance order rather than sorted, for the same
 * reason the fixture list itself is: sheet order is season order, and a season
 * that runs August to May would otherwise sort into January-first nonsense.
 *
 * Undated fixtures collect in a single trailing group rather than being
 * dropped — a fixture list part-way through being filled in is the normal
 * state of things in August, not an error.
 */
export function eplMonths(rows: EplRow[]): EplMonth[] {
  const order: (string | null)[] = [];
  const byMonth = new Map<string | null, EplRow[]>();

  for (const r of rows) {
    const key = r.date ? r.date.slice(0, 7) : null;
    if (!byMonth.has(key)) {
      byMonth.set(key, []);
      order.push(key);
    }
    byMonth.get(key)!.push(r);
  }

  // Undated last, whatever order they appeared in.
  const keys = [...order.filter((k) => k !== null), ...order.filter((k) => k === null)];

  return keys.map((month) => {
    const fixtures = byMonth.get(month)!;
    const playedRows = fixtures.filter((f) => f.amountCents !== null);
    const earnedCents = playedRows.reduce((a, f) => a + (f.amountCents ?? 0), 0);
    const expectedCents = playedRows.length * EPL_PER_GAME_CENTS;
    return {
      month,
      fixtures,
      played: playedRows.length,
      cleared: fixtures.filter((f) => f.state === 'cleared').length,
      short: fixtures.filter((f) => f.state === 'short').length,
      earnedCents,
      expectedCents,
      aheadCents: earnedCents - expectedCents,
      complete: playedRows.length === fixtures.length && fixtures.length > 0,
    };
  });
}
