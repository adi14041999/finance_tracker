import { describe, it, expect } from 'vitest';
import { netWorthSeries, netWorthSummary, accountTable, gapMonths } from './networth';
import type { Account, Balance, Config } from '../types';

const ACCOUNTS: Account[] = [
  { accountId: 'chk', name: 'Checking', klass: 'asset', active: true },
  { accountId: 'sav', name: 'Savings', klass: 'asset', active: true },
  { accountId: 'brk', name: 'Brokerage', klass: 'asset', active: true },
  { accountId: 'amex', name: 'Amex', klass: 'liability', active: true },
  { accountId: 'mtg', name: 'Mortgage', klass: 'liability', active: true },
];

const EMPTY_CONFIG: Config = {
  monthlySpendTargetCents: null,
  annualSpendTargetCents: null,
  netWorthGoalCents: null,
  concentrationWarnPct: null,
  startMonth: null,
};

let row = 1;
function bal(date: string, accountId: string, dollars: number): Balance {
  return {
    date,
    month: date.slice(0, 7),
    accountId,
    balanceCents: Math.round(dollars * 100),
    row: row++,
  };
}

describe('netWorthSeries', () => {
  it('negates liabilities exactly once', () => {
    // The sheet holds 1204.88 owing as a positive number. Net worth must
    // subtract it. Getting this wrong swings the headline by twice the debt.
    const balances = [bal('2026-07-31', 'chk', 8420.15), bal('2026-07-31', 'amex', 1204.88)];
    const [point] = netWorthSeries(ACCOUNTS, balances);

    expect(point.assetsCents).toBe(842015);
    expect(point.liabilitiesCents).toBe(-120488);
    expect(point.netCents).toBe(721527);
  });

  it('builds one point per month in order', () => {
    const balances = [
      bal('2026-06-30', 'chk', 8000),
      bal('2026-07-31', 'chk', 9000),
      bal('2026-08-31', 'chk', 10000),
    ];
    const series = netWorthSeries(ACCOUNTS, balances);
    expect(series.map((p) => p.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(series.map((p) => p.netCents)).toEqual([800000, 900000, 1000000]);
  });

  it('carries a missing account forward instead of dropping it', () => {
    // Forgetting the mortgage in July must not look like paying it off.
    const balances = [
      bal('2026-06-30', 'chk', 8000),
      bal('2026-06-30', 'mtg', 412000),
      bal('2026-07-31', 'chk', 9000),
    ];
    const series = netWorthSeries(ACCOUNTS, balances);
    const july = series[1];

    expect(july.netCents).toBe(900000 - 41200000);
    expect(july.carriedAccountIds).toEqual(['mtg']);
  });

  it('does not invent an account before its first appearance', () => {
    // Opening a brokerage in July must not retroactively enrich June.
    const balances = [
      bal('2026-06-30', 'chk', 8000),
      bal('2026-07-31', 'chk', 9000),
      bal('2026-07-31', 'brk', 50000),
    ];
    const series = netWorthSeries(ACCOUNTS, balances);

    expect(series[0].accounts.map((a) => a.accountId)).toEqual(['chk']);
    expect(series[0].netCents).toBe(800000);
    expect(series[1].netCents).toBe(5900000);
  });

  it('fills gaps in the middle of a range', () => {
    // No rows at all for July: the month still appears, carried forward.
    const balances = [bal('2026-06-30', 'chk', 8000), bal('2026-08-31', 'chk', 10000)];
    const series = netWorthSeries(ACCOUNTS, balances);

    expect(series.map((p) => p.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(series[1].netCents).toBe(800000);
    expect(series[1].carriedAccountIds).toEqual(['chk']);
  });

  it('lets a later row correct an earlier one for the same month', () => {
    const balances = [bal('2026-07-31', 'chk', 8000), bal('2026-07-31', 'chk', 9500)];
    const [point] = netWorthSeries(ACCOUNTS, balances);
    expect(point.netCents).toBe(950000);
  });

  it('respects a start month, without losing the carried balance', () => {
    const balances = [
      bal('2026-01-31', 'chk', 5000),
      bal('2026-06-30', 'chk', 8000),
      bal('2026-07-31', 'chk', 9000),
    ];
    const series = netWorthSeries(ACCOUNTS, balances, { startMonth: '2026-06' });
    expect(series.map((p) => p.month)).toEqual(['2026-06', '2026-07']);
  });

  it('returns nothing for an empty sheet rather than throwing', () => {
    expect(netWorthSeries(ACCOUNTS, [])).toEqual([]);
  });

  it('handles a balance for an account missing from the accounts tab', () => {
    // A typo'd account_id shouldn't crash the page; it's reported elsewhere.
    const series = netWorthSeries(ACCOUNTS, [bal('2026-07-31', 'typo', 100)]);
    expect(series[0].accounts[0].name).toBe('typo');
    expect(series[0].netCents).toBe(10000); // treated as an asset
  });
});

describe('netWorthSummary', () => {
  const balances = [
    bal('2026-07-31', 'chk', 8000),
    bal('2026-07-31', 'sav', 25000),
    bal('2026-07-31', 'brk', 60000),
    bal('2026-07-31', 'amex', 1000),
    bal('2026-08-31', 'chk', 9000),
    bal('2026-08-31', 'sav', 26000),
    bal('2026-08-31', 'brk', 62000),
    bal('2026-08-31', 'amex', 800),
  ];

  it('reports the month-over-month change', () => {
    const series = netWorthSeries(ACCOUNTS, balances);
    const s = netWorthSummary(series, EMPTY_CONFIG);
    // July:   8,000 + 25,000 + 60,000 - 1,000 = 92,000
    // August: 9,000 + 26,000 + 62,000 -   800 = 96,200
    expect(s.previous!.netCents).toBe(9200000);
    expect(s.current!.netCents).toBe(9620000);
    expect(s.changeCents).toBe(420000);
  });

  it('measures progress toward the goal', () => {
    const config: Config = { ...EMPTY_CONFIG, netWorthGoalCents: 100000000 };
    const series = netWorthSeries(ACCOUNTS, balances);
    const s = netWorthSummary(series, config);
    expect(s.goalRatio).toBeCloseTo(0.0962);
  });

  it('leaves deltas null when there is no history to compare', () => {
    const series = netWorthSeries(ACCOUNTS, [bal('2026-07-31', 'chk', 8000)]);
    const s = netWorthSummary(series, EMPTY_CONFIG);
    expect(s.changeCents).toBeNull();
    expect(s.changeYearCents).toBeNull();
  });

  it('copes with an empty series', () => {
    const s = netWorthSummary([], EMPTY_CONFIG);
    expect(s.current).toBeNull();
    expect(s.goalRatio).toBeNull();
  });
});

describe('accountTable', () => {
  it('shows each account with its change and share', () => {
    const balances = [
      bal('2026-07-31', 'chk', 8000),
      bal('2026-07-31', 'amex', 1000),
      bal('2026-08-31', 'chk', 9000),
      bal('2026-08-31', 'amex', 800),
    ];
    const rows = accountTable(netWorthSeries(ACCOUNTS, balances));

    const chk = rows.find((r) => r.accountId === 'chk')!;
    expect(chk.currentCents).toBe(900000);
    expect(chk.changeMonthCents).toBe(100000);
    expect(chk.shareOfAssets).toBe(1);

    // Paying down a card is a positive change: -1000 to -800.
    const amex = rows.find((r) => r.accountId === 'amex')!;
    expect(amex.currentCents).toBe(-80000);
    expect(amex.changeMonthCents).toBe(20000);
    expect(amex.shareOfAssets).toBeNull();
  });

  it('puts assets before liabilities', () => {
    const balances = [bal('2026-07-31', 'amex', 1000), bal('2026-07-31', 'chk', 8000)];
    const rows = accountTable(netWorthSeries(ACCOUNTS, balances));
    expect(rows.map((r) => r.accountId)).toEqual(['chk', 'amex']);
  });
});

describe('gapMonths', () => {
  it('names the months where something was carried forward', () => {
    const balances = [
      bal('2026-06-30', 'chk', 8000),
      bal('2026-06-30', 'mtg', 412000),
      bal('2026-07-31', 'chk', 9000),
      bal('2026-08-31', 'chk', 10000),
      bal('2026-08-31', 'mtg', 410000),
    ];
    const gaps = gapMonths(netWorthSeries(ACCOUNTS, balances));
    expect(gaps).toEqual([{ month: '2026-07', accountIds: ['mtg'] }]);
  });

  it('is empty when every month is complete', () => {
    const balances = [bal('2026-07-31', 'chk', 8000), bal('2026-08-31', 'chk', 9000)];
    expect(gapMonths(netWorthSeries(ACCOUNTS, balances))).toEqual([]);
  });
});
