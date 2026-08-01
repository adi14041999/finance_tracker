import { describe, it, expect } from 'vitest';
import { netWorthSeries, netWorthSummary, accountTable, gapMonths, visibleSeries } from './networth';
import type { Account, Balance, Config } from '../types';

const ACCOUNTS: Account[] = [
  { accountId: 'chk', name: 'Checking', klass: 'cash' },
  { accountId: 'sav', name: 'Savings', klass: 'cash' },
  { accountId: 'brk', name: 'Brokerage', klass: 'investment' },
  { accountId: 'amex', name: 'Amex', klass: 'liability' },
  { accountId: 'mtg', name: 'Mortgage', klass: 'liability' },
];

const EMPTY_CONFIG: Config = {
  monthlySpendTargetCents: null,
  annualSpendTargetCents: null,
  netWorthGoalCents: null,
  concentrationWarnPct: null,
  startMonth: null,
};

/** Thirteen consecutive months, 2025-07 through 2026-07. */
const MONTHS = [
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
];

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

  it('does not care which day of the month you snapshot on', () => {
    // Balances are point-in-time snapshots grouped by month. Whether you record
    // on the 21st or the last day, the month is what matters — so long as you
    // are consistent, the series is comparable month to month.
    const onThe21st = [
      bal('2026-06-21', 'chk', 8000),
      bal('2026-07-21', 'chk', 9000),
      bal('2026-08-21', 'chk', 10000),
    ];
    const atMonthEnd = [
      bal('2026-06-30', 'chk', 8000),
      bal('2026-07-31', 'chk', 9000),
      bal('2026-08-31', 'chk', 10000),
    ];
    const a = netWorthSeries(ACCOUNTS, onThe21st);
    const b = netWorthSeries(ACCOUNTS, atMonthEnd);

    expect(a.map((p) => p.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(a.map((p) => p.netCents)).toEqual(b.map((p) => p.netCents));
  });

  it('takes the later row when a month has two snapshots', () => {
    // Switching from month-end to the 21st, or correcting a figure, must not
    // double-count or pick the stale one.
    const balances = [
      bal('2026-07-21', 'chk', 9000),
      bal('2026-07-31', 'chk', 9500),
    ];
    const [point] = netWorthSeries(ACCOUNTS, balances);
    expect(point.netCents).toBe(950000);
  });

  it('lets a later row correct an earlier one for the same month', () => {
    const balances = [bal('2026-07-31', 'chk', 8000), bal('2026-07-31', 'chk', 9500)];
    const [point] = netWorthSeries(ACCOUNTS, balances);
    expect(point.netCents).toBe(950000);
  });

  it('always covers every month there is data for', () => {
    const balances = [
      bal('2026-01-31', 'chk', 5000),
      bal('2026-06-30', 'chk', 8000),
      bal('2026-07-31', 'chk', 9000),
    ];
    const series = netWorthSeries(ACCOUNTS, balances);
    expect(series[0].month).toBe('2026-01');
    expect(series[series.length - 1].month).toBe('2026-07');
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

  it('reports how liquid you are', () => {
    const series = netWorthSeries(ACCOUNTS, balances);
    const s = netWorthSummary(series, EMPTY_CONFIG);
    // August: cash 9,000 + 26,000 = 35,000; investments 62,000; assets 97,000.
    expect(s.current!.cashCents).toBe(3500000);
    expect(s.current!.investmentCents).toBe(6200000);
    expect(s.cashShare).toBeCloseTo(35000 / 97000);
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
      bal('2026-07-21', 'chk', 8000),
      bal('2026-07-21', 'amex', 1000),
      bal('2026-08-21', 'chk', 9000),
      bal('2026-08-21', 'amex', 800),
    ];
    const rows = accountTable(netWorthSeries(ACCOUNTS, balances));

    const chk = rows.find((r) => r.accountId === 'chk')!;
    expect(chk.currentCents).toBe(900000);
    expect(chk.changes[1].cents).toBe(100000);
    expect(chk.changes[1].pct).toBeCloseTo(0.125);
    expect(chk.shareOfAssets).toBe(1);

    // Paying down a card is a positive change: -1000 to -800, a 20% improvement.
    const amex = rows.find((r) => r.accountId === 'amex')!;
    expect(amex.currentCents).toBe(-80000);
    expect(amex.changes[1].cents).toBe(20000);
    expect(amex.changes[1].pct).toBeCloseTo(0.2);
    expect(amex.shareOfAssets).toBeNull();
  });

  it('fills 1, 3, 6 and 12 month columns when the history reaches back', () => {
    // 13 months of steady growth: 1,000 then +100 each month.
    const balances = MONTHS.map((m, i) => bal(`${m}-21`, 'chk', 1000 + i * 100));
    const [row] = accountTable(netWorthSeries(ACCOUNTS, balances));

    expect(row.currentCents).toBe(220000);           // 1,000 + 12 * 100
    expect(row.changes[1].cents).toBe(10000);        // one month of growth
    expect(row.changes[3].cents).toBe(30000);
    expect(row.changes[6].cents).toBe(60000);
    expect(row.changes[12].cents).toBe(120000);
  });

  it('leaves a column empty when the history is too short for it', () => {
    // Four months only: 1 and 3 resolve, 6 and 12 cannot.
    const balances = MONTHS.slice(0, 4).map((m, i) => bal(`${m}-21`, 'chk', 1000 + i * 100));
    const [row] = accountTable(netWorthSeries(ACCOUNTS, balances));

    expect(row.changes[1].cents).toBe(10000);
    expect(row.changes[3].cents).toBe(30000);
    expect(row.changes[6].cents).toBeNull();
    expect(row.changes[12].cents).toBeNull();
  });

  it('has no percentage when the previous balance was zero', () => {
    // $0 -> $64 is not "infinity percent"; the dollar figure carries it instead.
    const balances = [bal('2026-07-21', 'chk', 0), bal('2026-08-21', 'chk', 64)];
    const [row] = accountTable(netWorthSeries(ACCOUNTS, balances));
    expect(row.changes[1].cents).toBe(6400);
    expect(row.changes[1].pct).toBeNull();
  });

  it('suppresses percentages off a trivially small base', () => {
    // Owing $8 then owing $1,746 is "-21,925%", which is true and useless.
    const balances = [bal('2026-07-21', 'amex', 8), bal('2026-08-21', 'amex', 1746)];
    const [row] = accountTable(netWorthSeries(ACCOUNTS, balances));
    expect(row.changes[1].cents).toBe(-173800);
    expect(row.changes[1].pct).toBeNull();
  });

  it('still gives a percentage once the base clears $100', () => {
    const balances = [bal('2026-07-21', 'chk', 200), bal('2026-08-21', 'chk', 300)];
    const [row] = accountTable(netWorthSeries(ACCOUNTS, balances));
    expect(row.changes[1].pct).toBeCloseTo(0.5);
  });

  it('reports a flat account as zero percent, not blank', () => {
    const balances = [bal('2026-07-21', 'brk', 75151), bal('2026-08-21', 'brk', 75151)];
    const [row] = accountTable(netWorthSeries(ACCOUNTS, balances));
    expect(row.changes[1].cents).toBe(0);
    expect(row.changes[1].pct).toBe(0);
  });

  it('orders cash, then investments, then debts', () => {
    const balances = [
      bal('2026-07-21', 'amex', 1000),
      bal('2026-07-21', 'brk', 60000),
      bal('2026-07-21', 'chk', 8000),
    ];
    const rows = accountTable(netWorthSeries(ACCOUNTS, balances));
    expect(rows.map((r) => r.accountId)).toEqual(['chk', 'brk', 'amex']);
  });

  it('counts investments in share of assets, not just cash', () => {
    const balances = [bal('2026-07-21', 'chk', 25000), bal('2026-07-21', 'brk', 75000)];
    const rows = accountTable(netWorthSeries(ACCOUNTS, balances));
    expect(rows.find((r) => r.accountId === 'chk')!.shareOfAssets).toBeCloseTo(0.25);
    expect(rows.find((r) => r.accountId === 'brk')!.shareOfAssets).toBeCloseTo(0.75);
  });
});

describe('visibleSeries', () => {
  const balances = MONTHS.map((m, i) => bal(`${m}-21`, 'chk', 1000 + i * 100));

  it('trims only what is drawn', () => {
    const series = netWorthSeries(ACCOUNTS, balances);
    expect(series).toHaveLength(13);
    expect(visibleSeries(series, '2026-05')).toHaveLength(3);
  });

  it('leaves every computed figure untouched', () => {
    // The bug that prompted this split: a start month partway through made the
    // series short enough to blank the 12-month column, though the data was
    // sitting right there.
    const series = netWorthSeries(ACCOUNTS, balances);
    const before = accountTable(series)[0].changes[12].cents;
    expect(before).not.toBeNull();

    visibleSeries(series, '2026-05');
    expect(accountTable(series)[0].changes[12].cents).toBe(before);
  });

  it('returns everything when no start month is set', () => {
    expect(visibleSeries(netWorthSeries(ACCOUNTS, balances), null)).toHaveLength(13);
  });

  it('falls back to the whole series if the start month is past the data', () => {
    expect(visibleSeries(netWorthSeries(ACCOUNTS, balances), '2099-01')).toHaveLength(13);
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
