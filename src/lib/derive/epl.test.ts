import { describe, it, expect } from 'vitest';
import {
  eplRows, eplStatus, eplMonths,
  EPL_GAMES, EPL_PER_GAME_CENTS, EPL_TARGET_CENTS,
} from './epl';
import type { EplFixture } from '../types';

let row = 1;
const fix = (fixture: string, dollars: number | null, date: string | null = null): EplFixture =>
  ({
    index: row, fixture, date,
    amountCents: dollars === null ? null : Math.round(dollars * 100),
    row: row++,
  });

const status = (fixtures: EplFixture[]) => eplStatus(eplRows(fixtures));

describe('the season', () => {
  it('is 380 games — 20 clubs, home and away', () => {
    expect(EPL_GAMES).toBe(380);
    expect(EPL_GAMES).toBe(20 * 19);
  });

  it('is worth $19,000 at $50 a game', () => {
    expect(EPL_PER_GAME_CENTS).toBe(5_000);
    expect(EPL_TARGET_CENTS).toBe(1_900_000);
  });
});

describe('a fixture', () => {
  it('clears at exactly $50, not a cent above', () => {
    const rows = eplRows([fix('A v B', 50), fix('C v D', 49.99)]);
    expect(rows[0].state).toBe('cleared');
    expect(rows[1].state).toBe('short');
  });

  it('separates a played zero from a fixture not yet played', () => {
    const rows = eplRows([fix('A v B', 0), fix('C v D', null)]);
    expect(rows[0].state).toBe('short'); // played, brought nothing
    expect(rows[1].state).toBe('unplayed');
    expect(rows[0].deltaCents).toBe(-5_000);
    expect(rows[1].deltaCents).toBeNull();
  });

  it('treats a loss as played and short', () => {
    expect(eplRows([fix('A v B', -20)])[0].state).toBe('short');
  });
});

describe('status', () => {
  it('measures pace against games played, not dates', () => {
    // Ten games in at $50 means $500 was due; $620 is $120 ahead.
    const s = status([...Array.from({ length: 10 }, (_, i) => fix(`G${i}`, 62))]);
    expect(s.played).toBe(10);
    expect(s.expectedCents).toBe(50_000);
    expect(s.aheadCents).toBe(12_000);
    expect(s.onTrack).toBe(true);
  });

  it('ignores unplayed fixtures when judging pace', () => {
    // 370 blank rows must not count as 370 games that earned nothing.
    const s = status([
      fix('A v B', 100),
      ...Array.from({ length: 379 }, (_, i) => fix(`G${i}`, null)),
    ]);
    expect(s.played).toBe(1);
    expect(s.expectedCents).toBe(5_000);
    expect(s.onTrack).toBe(true);
  });

  it('counts cleared and short fixtures apart', () => {
    const s = status([fix('A', 80), fix('B', 10), fix('C', null)]);
    expect(s.cleared).toBe(1);
    expect(s.short).toBe(1);
    expect(s.played).toBe(2);
  });

  it('keeps the target at 380 games even if the sheet is short', () => {
    const s = status([fix('A v B', 50)]);
    expect(s.listed).toBe(1);
    expect(s.gamesLeft).toBe(379);
    expect(s.targetCents).toBe(1_900_000);
  });

  it('points at the next fixture with nothing logged', () => {
    const s = status([fix('A v B', 50), fix('C v D', null), fix('E v F', null)]);
    expect(s.next!.fixture).toBe('C v D');
  });

  it('has no next fixture once every game is logged', () => {
    expect(status([fix('A v B', 50)]).next).toBeNull();
  });

  it('works out what each remaining game must bring', () => {
    const s = status([fix('A v B', 0)]);
    expect(s.gamesLeft).toBe(379);
    expect(s.neededPerGameCents).toBe(Math.ceil(1_900_000 / 379));
  });

  it('goes past 100% on money rather than clamping', () => {
    const s = status([fix('A v B', 25000)]);
    expect(s.moneyProgress).toBeGreaterThan(1);
    expect(s.achieved).toBe(true);
    expect(s.remainingCents).toBe(0);
  });

  it('is all zeros rather than NaN before a ball is kicked', () => {
    const s = status([fix('A v B', null)]);
    expect(s.played).toBe(0);
    expect(s.earnedCents).toBe(0);
    expect(s.averagePerGameCents).toBeNull();
    expect(s.bestCents).toBeNull();
    expect(s.started).toBe(false);
    expect(s.neededPerGameCents).toBe(EPL_PER_GAME_CENTS);
  });
});

describe('grouping by month', () => {
  it('keeps months in season order, not calendar order', () => {
    // August through May: sorting alphabetically would put January first.
    const m = eplMonths(eplRows([
      fix('A', 50, '2026-08-15'),
      fix('B', 50, '2026-12-26'),
      fix('C', 50, '2027-01-02'),
    ]));
    expect(m.map((x) => x.month)).toEqual(['2026-08', '2026-12', '2027-01']);
  });

  it('totals each month on its own', () => {
    const m = eplMonths(eplRows([
      fix('A', 80, '2026-08-15'),
      fix('B', 20, '2026-08-22'),
      fix('C', null, '2026-09-12'),
    ]));
    expect(m[0].played).toBe(2);
    expect(m[0].cleared).toBe(1);
    expect(m[0].short).toBe(1);
    expect(m[0].earnedCents).toBe(10_000);
    expect(m[0].expectedCents).toBe(10_000);
    expect(m[0].aheadCents).toBe(0);
    expect(m[0].complete).toBe(true);
    expect(m[1].complete).toBe(false);
  });

  it('measures a month against only the games played in it', () => {
    // One of two played, and it cleared: ahead, not behind by the unplayed one.
    const m = eplMonths(eplRows([fix('A', 90, '2026-08-15'), fix('B', null, '2026-08-22')]));
    expect(m[0].expectedCents).toBe(5_000);
    expect(m[0].aheadCents).toBe(4_000);
  });

  it('collects undated fixtures into one trailing group', () => {
    const m = eplMonths(eplRows([
      fix('No date yet', null),
      fix('A', 50, '2026-08-15'),
      fix('Also undated', null),
    ]));
    expect(m.map((x) => x.month)).toEqual(['2026-08', null]);
    expect(m[1].fixtures).toHaveLength(2);
  });

  it('is empty for an empty list', () => {
    expect(eplMonths([])).toEqual([]);
  });
});
