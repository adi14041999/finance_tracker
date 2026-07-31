import { describe, it, expect } from 'vitest';
import {
  categorySpend, monthSummary, spendTrend, topCategories,
} from './expenses';
import type { Transaction, Category, Budget, Config } from '../types';

const CATEGORIES: Category[] = [
  { category: 'Rent' },
  { category: 'Groceries' },
  { category: 'Restaurants' },
  { category: 'Compute' },
  { category: 'Flights' },
];

const EMPTY_CONFIG: Config = {
  monthlySpendTargetCents: null,
  annualSpendTargetCents: null,
  netWorthGoalCents: null,
  concentrationWarnPct: null,
  startMonth: null,
};

let row = 1;
function tx(date: string, category: string, dollars: number): Transaction {
  return {
    date,
    month: date.slice(0, 7),
    description: `${category} spend`,
    category,
    amountCents: Math.round(dollars * 100),
    row: row++,
  };
}

function budget(month: string, category: string, dollars: number): Budget {
  return { month, category, amountCents: dollars * 100, row: row++ };
}

describe('categorySpend', () => {
  it('totals a month and compares against the sheet budget', () => {
    const transactions = [
      tx('2026-07-03', 'Groceries', 86.42),
      tx('2026-07-11', 'Groceries', 113.58),
      tx('2026-07-01', 'Rent', 2400),
    ];
    const budgets = [budget('2026-07', 'Groceries', 600), budget('2026-07', 'Rent', 2400)];

    const result = categorySpend(transactions, CATEGORIES, budgets, '2026-07');
    const groceries = result.find((c) => c.category === 'Groceries')!;

    expect(groceries.spentCents).toBe(20000);
    expect(groceries.budgetCents).toBe(60000);
    expect(groceries.ratio).toBeCloseTo(1 / 3);
    expect(groceries.status).toBe('under');
  });

  it('flags over budget, and near budget at 85%', () => {
    const transactions = [tx('2026-07-03', 'Groceries', 700), tx('2026-07-04', 'Compute', 340)];
    const budgets = [budget('2026-07', 'Groceries', 600), budget('2026-07', 'Compute', 400)];

    const result = categorySpend(transactions, CATEGORIES, budgets, '2026-07');
    expect(result.find((c) => c.category === 'Groceries')!.status).toBe('over');
    expect(result.find((c) => c.category === 'Compute')!.status).toBe('near');
  });

  it('sorts problems to the top, not alphabetically', () => {
    const transactions = [
      tx('2026-07-01', 'Rent', 2400),        // exactly on budget
      tx('2026-07-03', 'Groceries', 900),    // $300 over
      tx('2026-07-05', 'Compute', 900),          // $500 over
    ];
    const budgets = [
      budget('2026-07', 'Rent', 2400),
      budget('2026-07', 'Groceries', 600),
      budget('2026-07', 'Compute', 400),
    ];

    const result = categorySpend(transactions, CATEGORIES, budgets, '2026-07');
    // Biggest overshoot first, so the worst problem is the first thing you see.
    expect(result.map((c) => c.category)).toEqual(['Compute', 'Groceries', 'Rent']);
  });

  it('subtracts refunds from the category they came from', () => {
    const transactions = [
      tx('2026-07-03', 'Groceries', 200),
      tx('2026-07-12', 'Groceries', -89),
    ];
    const result = categorySpend(transactions, CATEGORIES, [], '2026-07');
    expect(result.find((c) => c.category === 'Groceries')!.spentCents).toBe(11100);
  });

  it('ignores other months', () => {
    const transactions = [tx('2026-06-30', 'Groceries', 500), tx('2026-07-01', 'Groceries', 100)];
    const result = categorySpend(transactions, CATEGORIES, [], '2026-07');
    expect(result.find((c) => c.category === 'Groceries')!.spentCents).toBe(10000);
  });

  it('hides categories with no spend and no budget', () => {
    const transactions = [tx('2026-07-03', 'Groceries', 100)];
    const result = categorySpend(transactions, CATEGORIES, [], '2026-07');
    expect(result.map((c) => c.category)).toEqual(['Groceries']);
  });

  it('shows no budget at all when the sheet has none', () => {
    // Deliberate: a budget is a decision you made, not one inferred from your
    // own past spending. No budgets tab rows means no bars to compare against.
    const transactions = [
      tx('2026-05-03', 'Groceries', 600),
      tx('2026-06-03', 'Groceries', 700),
      tx('2026-07-03', 'Groceries', 650),
    ];
    const result = categorySpend(transactions, CATEGORIES, [], '2026-07');
    const groceries = result.find((c) => c.category === 'Groceries')!;
    expect(groceries.budgetCents).toBeNull();
    expect(groceries.ratio).toBeNull();
    expect(groceries.status).toBe('none');
  });

  it('keeps a budgeted category visible even at zero spend', () => {
    // You budgeted for it and spent nothing — that's information, not noise.
    const result = categorySpend([], CATEGORIES, [budget('2026-07', 'Flights', 500)], '2026-07');
    const flights = result.find((c) => c.category === 'Flights')!;
    expect(flights.spentCents).toBe(0);
    expect(flights.status).toBe('under');
  });
});

describe('monthSummary', () => {
  const transactions = [
    tx('2026-07-01', 'Rent', 2400),
    tx('2026-07-03', 'Groceries', 200),
    tx('2026-07-05', 'Restaurants', 150),
    tx('2026-07-09', 'Flights', 418.6),
    tx('2026-07-12', 'Groceries', -89),
  ];

  it('totals the month', () => {
    const s = monthSummary(transactions, CATEGORIES, [], EMPTY_CONFIG, '2026-07', '2026-07-20');
    // 2400 + 200 + 150 + 418.60 - 89
    expect(s.totalCents).toBe(307960);
    expect(s.transactionCount).toBe(5);
  });

  it('averages spend over the days elapsed, not the whole month', () => {
    // $3,079.60 across 20 days of July = $153.98/day. Dividing by 31 would
    // understate the run rate and make a hot month look calm.
    const s = monthSummary(transactions, CATEGORIES, [], EMPTY_CONFIG, '2026-07', '2026-07-20');
    expect(s.dailyAverageCents).toBe(15398);
  });

  it('uses the full month once it is over', () => {
    const s = monthSummary(transactions, CATEGORIES, [], EMPTY_CONFIG, '2026-07', '2026-09-04');
    expect(s.dailyAverageCents).toBe(Math.round(307960 / 31));
  });

  it('does not divide by zero on the first of the month', () => {
    const s = monthSummary(transactions, CATEGORIES, [], EMPTY_CONFIG, '2026-07', '2026-07-01');
    expect(Number.isFinite(s.dailyAverageCents)).toBe(true);
  });

  it('compares spend against target and pace', () => {
    const config: Config = { ...EMPTY_CONFIG, monthlySpendTargetCents: 500000 };
    const s = monthSummary(transactions, CATEGORIES, [], config, '2026-07', '2026-07-15');
    expect(s.targetRatio).toBeCloseTo(307960 / 500000);
    expect(s.elapsed).toBeCloseTo(15 / 31);
    // 61.6% of budget spent with 48.4% of the month gone: running hot.
    expect(s.targetRatio!).toBeGreaterThan(s.elapsed);
  });

  it('counts only explicit budgets in the budgeted total', () => {
    const budgets = [budget('2026-07', 'Rent', 2400), budget('2026-07', 'Groceries', 600)];
    const s = monthSummary(transactions, CATEGORIES, budgets, EMPTY_CONFIG, '2026-07', '2026-07-20');
    expect(s.budgetedTotalCents).toBe(300000);
  });

  it('survives a month with no data', () => {
    const s = monthSummary([], CATEGORIES, [], EMPTY_CONFIG, '2026-07', '2026-07-20');
    expect(s.totalCents).toBe(0);
    expect(s.categories).toEqual([]);
  });
});

describe('spendTrend', () => {
  it('totals each month and holds the rolling mean back until it is real', () => {
    const transactions = [
      tx('2026-05-01', 'Rent', 1000),
      tx('2026-06-01', 'Rent', 2000),
      tx('2026-07-01', 'Rent', 3000),
    ];
    const trend = spendTrend(transactions, ['2026-05', '2026-06', '2026-07']);

    expect(trend.map((p) => p.totalCents)).toEqual([100000, 200000, 300000]);
    expect(trend[0].rollingCents).toBeNull();
    expect(trend[1].rollingCents).toBeNull();
    expect(trend[2].rollingCents).toBe(200000);
  });

  it('narrows to one category when asked', () => {
    const transactions = [
      tx('2026-06-01', 'Rent', 2000),
      tx('2026-06-04', 'Groceries', 300),
      tx('2026-07-01', 'Rent', 2000),
      tx('2026-07-04', 'Groceries', 450),
    ];
    const all = spendTrend(transactions, ['2026-06', '2026-07']);
    const groceries = spendTrend(transactions, ['2026-06', '2026-07'], 'Groceries');

    expect(all.map((p) => p.totalCents)).toEqual([230000, 245000]);
    expect(groceries.map((p) => p.totalCents)).toEqual([30000, 45000]);
  });

  it('shows months with no spend as zero, not as a gap', () => {
    const trend = spendTrend([tx('2026-07-01', 'Rent', 1000)], ['2026-05', '2026-06', '2026-07']);
    expect(trend.map((p) => p.totalCents)).toEqual([0, 0, 100000]);
  });
});

describe('topCategories', () => {
  it('ranks by spend and caps the list', () => {
    const transactions = [
      tx('2026-07-01', 'Rent', 2400),
      tx('2026-07-03', 'Groceries', 200),
      tx('2026-07-05', 'Restaurants', 150),
      tx('2026-07-09', 'Flights', 418.6),
    ];
    const s = monthSummary(transactions, CATEGORIES, [], EMPTY_CONFIG, '2026-07', '2026-07-20');
    expect(topCategories(s, 2).map((c) => c.category)).toEqual(['Rent', 'Flights']);
  });
});
