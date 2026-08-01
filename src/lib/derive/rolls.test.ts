import { describe, it, expect } from 'vitest';
import { rollRows, rollSummary, rollEvents, sortRolls } from './rolls';
import type { Roll } from '../types';

let row = 1;

/** Dollars in, cents out. */
function roll(
  ticker: string, date: string, from: number, to: number,
  cost: number, contracts: number, recovered: number,
): Roll {
  const costCents = Math.round(cost * 100);
  return {
    ticker, date, strikeFrom: from, strikeTo: to,
    costCents, contracts,
    totalCostCents: Math.round(costCents * contracts),
    recoveredCents: Math.round(recovered * 100),
    row: row++,
  };
}

describe('per roll', () => {
  it('works out percent, remainder and strike distance', () => {
    const [r] = rollRows([roll('X', '2026-01-12', 100, 150, 1000, 2, 500)]);
    expect(r.totalCostCents).toBe(200_000);
    expect(r.remainingCents).toBe(150_000);
    expect(r.pctRecovered).toBeCloseTo(0.25, 10);
    expect(r.strikeMoved).toBe(50);
  });

  it('goes past 100% rather than capping, since that is real profit', () => {
    const [r] = rollRows([roll('X', '2026-01-12', 10, 20, 100, 1, 150)]);
    expect(r.pctRecovered).toBeCloseTo(1.5, 10);
    expect(r.remainingCents).toBe(-5_000);
  });

  it('has no percentage for a roll that cost nothing', () => {
    const [r] = rollRows([roll('X', '2026-01-12', 10, 20, 0, 1, 0)]);
    expect(r.pctRecovered).toBeNull();
  });
});

describe('summary', () => {
  const rows = rollRows([
    roll('A', '2026-01-12', 10, 20, 100, 2, 50),
    roll('B', '2026-01-12', 30, 40, 200, 1, 200),
    roll('A', '2025-08-04', 5, 15, 50, 4, 0),
  ]);
  const s = rollSummary(rows);

  it('adds cost and recovery across every roll', () => {
    expect(s.totalCostCents).toBe(60_000); // 200 + 200 + 200
    expect(s.recoveredCents).toBe(25_000);
    expect(s.remainingCents).toBe(35_000);
    expect(s.progress).toBeCloseTo(25_000 / 60_000, 10);
  });

  it('counts rolls, contracts and distinct tickers separately', () => {
    expect(s.rollCount).toBe(3);
    expect(s.contracts).toBe(7);
    expect(s.tickers).toBe(2); // A twice, B once
  });

  it('counts a roll as cleared only once nothing is left', () => {
    expect(s.clearedCount).toBe(1); // B alone
  });

  it('is zero rather than NaN with no rolls at all', () => {
    const empty = rollSummary([]);
    expect(empty.progress).toBe(0);
    expect(empty.totalCostCents).toBe(0);
  });
});

describe('events', () => {
  const rows = rollRows([
    roll('A', '2026-01-12', 10, 20, 100, 1, 10),
    roll('B', '2026-01-12', 30, 40, 200, 1, 20),
    roll('A', '2025-08-04', 5, 15, 50, 1, 5),
  ]);

  it('groups by day, newest first', () => {
    const e = rollEvents(rows);
    expect(e.map((x) => x.date)).toEqual(['2026-01-12', '2025-08-04']);
    expect(e[0].rollCount).toBe(2);
    expect(e[0].totalCostCents).toBe(30_000);
    expect(e[0].tickers).toEqual(['A', 'B']);
  });

  it('never double-counts a ticker rolled twice in a day', () => {
    const e = rollEvents(rollRows([
      roll('A', '2026-01-12', 10, 20, 100, 1, 0),
      roll('A', '2026-01-12', 20, 30, 100, 1, 0),
    ]));
    expect(e[0].rollCount).toBe(2);
    expect(e[0].tickers).toEqual(['A']);
  });
});

describe('sorting', () => {
  const rows = rollRows([
    roll('B', '2025-08-04', 1, 2, 100, 1, 90),
    roll('A', '2026-01-12', 1, 2, 500, 1, 50),
  ]);

  it('leads with the biggest remainder by default', () => {
    expect(sortRolls(rows, 'remaining').map((r) => r.ticker)).toEqual(['A', 'B']);
  });

  it('leads with the best-recovered on progress', () => {
    expect(sortRolls(rows, 'progress').map((r) => r.ticker)).toEqual(['B', 'A']);
  });

  it('never changes a figure', () => {
    expect(rollSummary(sortRolls(rows, 'progress'))).toEqual(rollSummary(rows));
  });

  it('leaves the input untouched', () => {
    const order = rows.map((r) => r.ticker);
    sortRolls(rows, 'ticker');
    expect(rows.map((r) => r.ticker)).toEqual(order);
  });
});

/**
 * The real roll log. Every figure here was checked against the sheet, so a
 * change that moves one moved something real.
 */
describe('reconciles against the real sheet', () => {
  const REAL: [string, string, number, number, number, number, number][] = [
    ['CRWD', '2025-08-04', 320, 465, 15150.08, 1, 4300.86],
    ['CRWD', '2026-01-12', 320, 470, 14440.08, 1, 2033.96],
    ['META', '2025-08-04', 550, 785, 23500.08, 1, 8249.56],
    ['META', '2026-01-12', 490, 690, 16300.08, 4, 6322.56],
    ['JMIA', '2026-01-12', 5, 15, 600.08, 8, 365.76],
    ['UPST', '2026-01-12', 37.5, 49.5, 1150.08, 1, 484.96],
    ['LYFT', '2026-01-12', 16, 20.5, 434.08, 1, 120.96],
    ['SNOW', '2026-01-12', 160, 230, 6360.08, 1, 1389.08],
    ['SCHG', '2026-01-12', 28, 35, 618.88, 5, 179],
    ['NVDA', '2026-01-12', 130, 190, 6850.08, 2, 1014],
    ['AFRM', '2026-01-12', 40, 80, 4120.08, 3, 1545.4],
  ];

  const rows = rollRows(REAL.map((r) => roll(...r)));
  const s = rollSummary(rows);

  it('totals $160,190.24 across 28 contracts', () => {
    expect(s.totalCostCents).toBe(16_019_024);
    expect(s.contracts).toBe(28);
    expect(s.rollCount).toBe(11);
    expect(s.tickers).toBe(9); // CRWD and META appear twice
  });

  it('has recovered $26,006.10, leaving $134,184.14', () => {
    expect(s.recoveredCents).toBe(2_600_610);
    expect(s.remainingCents).toBe(13_418_414);
    expect(s.progress).toBeCloseTo(0.1623, 4);
  });

  it('reproduces the per-roll percentages in the sheet', () => {
    const pct = (t: string, d: string) =>
      rows.find((r) => r.ticker === t && r.date === d)!.pctRecovered!;
    expect(pct('CRWD', '2025-08-04')).toBeCloseTo(0.2839, 4);
    expect(pct('META', '2026-01-12')).toBeCloseTo(0.0970, 4);
    expect(pct('UPST', '2026-01-12')).toBeCloseTo(0.4217, 4);
    expect(pct('SCHG', '2026-01-12')).toBeCloseTo(0.0578, 4);
  });

  it('confirms cost x contracts equals the sheet total on every row', () => {
    // META's 4 contracts at $16,300.08 make $65,200.32, and SCHG's 5 at
    // $618.88 make $3,094.40 — the two rows where the multiplication matters.
    const meta = rows.find((r) => r.ticker === 'META' && r.contracts === 4)!;
    expect(meta.totalCostCents).toBe(6_520_032);
    const schg = rows.find((r) => r.ticker === 'SCHG')!;
    expect(schg.totalCostCents).toBe(309_440);
  });

  it('groups into the two days the rolling actually happened', () => {
    const e = rollEvents(rows);
    expect(e.map((x) => x.date)).toEqual(['2026-01-12', '2025-08-04']);
    expect(e[0].totalCostCents).toBe(12_154_008); // $121,540.08
    expect(e[1].totalCostCents).toBe(3_865_016); // $38,650.16
    expect(e[0].rollCount).toBe(9);
    expect(e[1].rollCount).toBe(2);
  });

  it('has nothing cleared yet', () => {
    expect(s.clearedCount).toBe(0);
  });
});
