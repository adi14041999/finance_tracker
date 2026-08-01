import { describe, it, expect } from 'vitest';
import {
  heldNames, closedNames, recoverySummary, sortHeld,
} from './positions';
import type { Position } from '../types';

let row = 1;

/** Dollars in, cents out — tests read in the units the sheet is typed in. */
function pos(
  ticker: string,
  recover: number,
  mean: number | null,
  units: number | null,
  price: number | null = null,
): Position {
  return {
    ticker,
    recoverCents: Math.round(recover * 100),
    meanCents: mean === null ? null : Math.round(mean * 100),
    units,
    priceCents: price === null ? null : Math.round(price * 100),
    row: row++,
  };
}

describe('break-even', () => {
  it('is mean plus recover per share, not mean', () => {
    // $10,000 owed spread over 100 shares is $100 a share on top of the $50 mean.
    const [h] = heldNames([pos('X', 10_000, 50, 100)]);
    expect(h.breakEvenCents).toBe(15_000);
    expect(h.breakEvenMultiple).toBeCloseTo(3, 10);
  });

  it('equals the mean when nothing is owed', () => {
    const [h] = heldNames([pos('SPY', 0, 681.81, 27.77)]);
    expect(h.breakEvenCents).toBe(68_181);
    expect(h.breakEvenMultiple).toBe(1);
  });

  it('handles fractional units', () => {
    // META: 500.86 units at $350, $205,096 owed. 20509600 / 500.86 = 40948.89c.
    const [h] = heldNames([pos('META', 205_096, 350, 500.86)]);
    expect(h.breakEvenCents).toBe(75_949); // $759.49
    expect(h.costBasisCents).toBe(17_530_100); // $175,301
  });

  it('is unaffected by the current price', () => {
    const cheap = heldNames([pos('X', 5_000, 10, 500, 2)])[0];
    const dear = heldNames([pos('X', 5_000, 10, 500, 90)])[0];
    expect(cheap.breakEvenCents).toBe(dear.breakEvenCents);
  });
});

describe('gap to break-even', () => {
  it('measures the climb from today, not from the mean', () => {
    // Break-even $20. At $10 the stock must double: +100%.
    const [h] = heldNames([pos('X', 1_000, 10, 100, 10)]);
    expect(h.breakEvenCents).toBe(2_000);
    expect(h.gapPct).toBeCloseTo(1, 10);
    expect(h.cleared).toBe(false);
  });

  it('goes negative once the price is past break-even', () => {
    const [h] = heldNames([pos('X', 1_000, 10, 100, 25)]);
    expect(h.gapPct).toBeLessThan(0);
    expect(h.cleared).toBe(true);
  });

  it('is null without a price, and the name is not treated as cleared', () => {
    const [h] = heldNames([pos('X', 1_000, 10, 100)]);
    expect(h.gapPct).toBeNull();
    expect(h.cleared).toBe(false);
    expect(h.marketValueCents).toBeNull();
  });
});

describe('recovered and remaining', () => {
  it('recovers nothing while the position is under water', () => {
    const [h] = heldNames([pos('X', 1_000, 10, 100, 6)]);
    expect(h.unrealisedCents).toBe(-40_000);
    expect(h.recoveredCents).toBe(0);
    expect(h.remainingCents).toBe(100_000);
    expect(h.surplusCents).toBe(0);
  });

  it('recovers the unrealized gain, up to what is owed', () => {
    const [h] = heldNames([pos('X', 1_000, 10, 100, 13)]);
    expect(h.unrealisedCents).toBe(30_000);
    expect(h.recoveredCents).toBe(30_000);
    expect(h.remainingCents).toBe(70_000);
  });

  it('caps recovery at the debt and calls the rest surplus', () => {
    const [h] = heldNames([pos('X', 1_000, 10, 100, 30)]);
    expect(h.unrealisedCents).toBe(200_000);
    expect(h.recoveredCents).toBe(100_000); // not 200,000
    expect(h.remainingCents).toBe(0);
    expect(h.surplusCents).toBe(100_000);
  });

  it('counts an unpriced name as having recovered nothing', () => {
    const [h] = heldNames([pos('X', 1_000, 10, 100)]);
    expect(h.recoveredCents).toBeNull();
    expect(h.remainingCents).toBe(100_000); // the full debt, not zero
  });

  it('treats a gain on a name that owes nothing as pure surplus', () => {
    const [h] = heldNames([pos('VTI', 0, 337.18, 500, 400)]);
    expect(h.recoveredCents).toBe(0);
    expect(h.surplusCents).toBe(h.unrealisedCents);
  });
});

describe('closed names', () => {
  const rows = [
    pos('META', 205_096, 350, 500.86, 700),
    pos('ENPH', 20_001, null, null),
    pos('PLTR', 10_000, null, null),
  ];

  it('picks out the ones with a debt and no position', () => {
    expect(closedNames(rows).map((c) => c.ticker)).toEqual(['ENPH', 'PLTR']);
  });

  it('leaves them out of the held list', () => {
    expect(heldNames(rows).map((h) => h.ticker)).toEqual(['META']);
  });

  it('keeps their debt outstanding no matter how well anything else does', () => {
    const held = heldNames(rows);
    const summary = recoverySummary(held, closedNames(rows));
    // META at $700 is well past its $759.49... no, short of it — but even a
    // wild gain elsewhere must not pay off ENPH.
    const wild = recoverySummary(heldNames([pos('META', 205_096, 350, 500.86, 5_000)]), closedNames(rows));
    expect(wild.remainingCents).toBeGreaterThanOrEqual(3_000_100); // ENPH + PLTR
    expect(summary.closedRecoverCents).toBe(3_000_100);
  });
});

describe('summary', () => {
  it('splits the ledger into held and closed without losing a cent', () => {
    const rows = [
      pos('A', 1_000, 10, 100, 10),
      pos('B', 2_500, 5, 200, 5),
      pos('C', 700, null, null),
      pos('D', 300, null, null),
    ];
    const s = recoverySummary(heldNames(rows), closedNames(rows));
    expect(s.heldRecoverCents).toBe(350_000);
    expect(s.closedRecoverCents).toBe(100_000);
    expect(s.totalRecoverCents).toBe(450_000);
    expect(s.heldCount).toBe(2);
    expect(s.closedCount).toBe(2);
  });

  it('reports no progress when every position is flat at its mean', () => {
    const rows = [pos('A', 1_000, 10, 100, 10), pos('B', 500, null, null)];
    const s = recoverySummary(heldNames(rows), closedNames(rows));
    expect(s.recoveredCents).toBe(0);
    expect(s.progress).toBe(0);
    expect(s.remainingCents).toBe(s.totalRecoverCents);
  });

  it('never lets progress exceed the ledger, however large the gains', () => {
    const rows = [pos('A', 1_000, 10, 100, 1_000), pos('B', 500, null, null)];
    const s = recoverySummary(heldNames(rows), closedNames(rows));
    expect(s.recoveredCents).toBe(100_000); // A's debt, and only A's
    expect(s.remainingCents).toBe(50_000); // B is untouched
    expect(s.progress).toBeCloseTo(100_000 / 150_000, 10);
    expect(s.surplusCents).toBe(9_800_000);
  });

  it('lists unpriced names and holds their debt outstanding', () => {
    const rows = [pos('A', 1_000, 10, 100, 30), pos('B', 1_000, 10, 100)];
    const s = recoverySummary(heldNames(rows), closedNames(rows));
    expect(s.unpriced).toEqual(['B']);
    expect(s.recoveredCents).toBe(100_000); // A only
    expect(s.remainingCents).toBe(100_000); // B in full
  });

  it('leaves market value null when nothing has a price', () => {
    const rows = [pos('A', 1_000, 10, 100)];
    const s = recoverySummary(heldNames(rows), closedNames(rows));
    expect(s.marketValueCents).toBeNull();
    expect(s.unrealisedCents).toBeNull();
    expect(s.costBasisCents).toBe(100_000); // basis needs no price
  });

  it('progress is zero rather than NaN on an empty ledger', () => {
    const s = recoverySummary([], []);
    expect(s.progress).toBe(0);
    expect(s.totalRecoverCents).toBe(0);
  });
});

/**
 * Adi's actual ledger, July 2026. These three totals were checked against the
 * sum he keeps at the bottom of the sheet ($422,956), so if a change to the
 * parsing or the split ever moves them, it moved something real.
 */
describe("reconciles against the real sheet", () => {
  const REAL: [string, number, number | null, number | null][] = [
    ['AAL', 500, null, null], ['AAOI', 32, null, null], ['ABNB', 500, null, null],
    ['ACB', 1500, 4.88, 200], ['AFRM', 15004, 37.16, 300], ['AMC', 500, null, null],
    ['AMZN', 405, null, null], ['ARKK', 2000, null, null], ['BABA', 3000, null, null],
    ['BFLY', 1500, 1.86, 1500], ['CAR', 20000, 259.09, 300], ['COHR', 146, null, null],
    ['COIN', 500, null, null], ['COST', 10, null, null], ['CPNG', 500, null, null],
    ['CRWD', 50007, 367.5, 300], ['DASH', 500, null, null], ['DOCU', 125, null, null],
    ['ENPH', 20001, null, null], ['ETSY', 1000, null, null], ['FDS', 1488, null, null],
    ['FSLY', 5000, 8.76, 800], ['HOOD', 1001, null, null], ['JETS', 500, null, null],
    ['JMIA', 10000, 3.39, 800], ['LCID', 2000, 7.18, 1000], ['LMT', 0, 646.04, 0.14],
    ['LYFT', 980, 15.3, 300], ['META', 205096, 350, 500.86], ['MOGU', 500, null, null],
    ['MRNA', 6, null, null], ['MSFT', 479, null, null], ['NFLX', 500, 84.36, 1500],
    ['NICE', 1000, 129.14, 300], ['NIO', 684, null, null], ['NVDA', 19396, 128.75, 200.24],
    ['PATH', 1501, null, null], ['PINS', 2000, null, null], ['PLTR', 10000, null, null],
    ['PLUG', 6000, 1.71, 4000], ['PTON', 961, null, null], ['PYPL', 4000, 50.06, 300],
    ['RBLX', 3000, null, null], ['RDDT', 504, null, null], ['RIOT', 1000, null, null],
    ['SCHG', 4488, 24.23, 501.5], ['SFIX', 500, 4.68, 500], ['SNDL', 3000, 1.88, 800],
    ['SNOW', 10000, 150, 100], ['SPY', 0, 681.81, 27.77], ['TSM', 1000, null, null],
    ['UBER', 500, null, null], ['UPST', 2000, 25, 100], ['VOO', 0, 632.15, 3.66],
    ['VTI', 0, 337.18, 500], ['XYZ', 4642, null, null], ['Z', 1500, 38.29, 500],
  ];

  const rows = REAL.map(([t, r, m, u]) => pos(t, r, m, u));
  const held = heldNames(rows);
  const closed = closedNames(rows);
  const s = recoverySummary(held, closed);

  it('totals $422,956, matching the sum in the sheet', () => {
    expect(s.totalRecoverCents).toBe(42_295_600);
  });

  it('splits 25 held / 32 closed', () => {
    expect(s.heldCount).toBe(25);
    expect(s.closedCount).toBe(32);
    expect(s.heldRecoverCents).toBe(36_347_100); // $363,471
    expect(s.closedRecoverCents).toBe(5_948_500); // $59,485
  });

  it('adds up to a $855,171.23 cost basis', () => {
    // SCHG lands exactly on a half cent (2423c x 501.5 = 1,215,134.5), so this
    // total is one cent sensitive to the rounding rule. Half up, matching
    // dollarsToCents, which is why it ends .23 and not .22.
    expect(s.costBasisCents).toBe(85_517_123);
  });

  it('reproduces the break-even prices', () => {
    const be = new Map(held.map((h) => [h.ticker, h.breakEvenCents]));
    expect(be.get('JMIA')).toBe(1_589); // $15.89, 4.69x
    expect(be.get('META')).toBe(75_949); // $759.49
    expect(be.get('CRWD')).toBe(53_419); // $534.19
    expect(be.get('NVDA')).toBe(22_561); // $225.61
    expect(be.get('CAR')).toBe(32_576); // $325.76
    expect(be.get('SNOW')).toBe(25_000); // $250.00, exactly
    expect(be.get('UPST')).toBe(4_500); // $45.00
    expect(be.get('VTI')).toBe(33_718); // owes nothing, so its mean
  });

  it('finds the four names that owe nothing', () => {
    const free = held.filter((h) => h.recoverCents === 0).map((h) => h.ticker).sort();
    expect(free).toEqual(['LMT', 'SPY', 'VOO', 'VTI']);
  });

  it('holds the whole ledger outstanding with no prices loaded', () => {
    expect(s.remainingCents).toBe(s.totalRecoverCents);
    expect(s.unpriced).toHaveLength(25);
  });
});

describe('sorting', () => {
  const rows = [
    pos('B', 500, 10, 100, 12),
    pos('A', 9_000, 10, 100, 11),
    pos('C', 1_000, 10, 100),
  ];
  const held = heldNames(rows);

  it('orders by recover, largest first, by default', () => {
    expect(sortHeld(held, 'recover').map((h) => h.ticker)).toEqual(['A', 'C', 'B']);
  });

  it('sinks names without a price to the bottom of a gap sort', () => {
    expect(sortHeld(held, 'gap').map((h) => h.ticker)).toEqual(['B', 'A', 'C']);
  });

  it('never changes a number', () => {
    const before = recoverySummary(held, []);
    const after = recoverySummary(sortHeld(held, 'gap'), []);
    expect(after).toEqual(before);
  });

  it('leaves the input untouched', () => {
    const order = held.map((h) => h.ticker);
    sortHeld(held, 'ticker');
    expect(held.map((h) => h.ticker)).toEqual(order);
  });
});
