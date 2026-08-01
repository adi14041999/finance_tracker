import { describe, it, expect } from 'vitest';
import { parseSheet, type RawSheet } from './parse';

const META = { fetchedAt: '2026-07-31T00:00:00.000Z', source: 'sample' as const };

function sheet(overrides: Partial<RawSheet> = {}): RawSheet {
  return {
    accounts: [
      ['account_id', 'name', 'class'],
      ['chk', 'Checking', 'cash'],
      ['amex', 'Amex', 'liability'],
    ],
    categories: [
      ['category'],
      ['Groceries'],
      ['Restaurants'],
    ],
    transactions: [
      ['date', 'description', 'category', 'amount'],
      ['2026-07-03', "Trader Joe's", 'Groceries', 86.42],
    ],
    balances: [
      ['date', 'account_id', 'balance'],
      ['2026-07-31', 'chk', 8420.15],
    ],
    budgets: [
      ['month', 'category', 'amount'],
      ['2026-07', 'Groceries', 600],
    ],
    holdings: [
      ['account_id', 'ticker', 'name', 'asset_class', 'quantity', 'price', 'market_value', 'cost_basis'],
      ['chk', 'VTI', 'Vanguard', 'us_equity', 142.5, 305.4, 43519.5, 34200],
    ],
    config: [
      ['key', 'value', 'description'],
      ['monthly_spend_target', 5000, ''],
      ['concentration_warn_pct', 0.25, ''],
    ],
    ...overrides,
  };
}

describe('parseSheet', () => {
  it('reads a well-formed sheet with no problems', () => {
    const data = parseSheet(sheet(), META);
    expect(data.problems).toEqual([]);
    expect(data.accounts).toHaveLength(2);
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].amountCents).toBe(8642);
    expect(data.transactions[0].month).toBe('2026-07');
    expect(data.config.monthlySpendTargetCents).toBe(500000);
    expect(data.config.concentrationWarnPct).toBe(0.25);
  });

  it('finds columns by name, so reordering them is survivable', () => {
    const data = parseSheet(sheet({
      transactions: [
        ['amount', 'category', 'date', 'description'],
        [86.42, 'Groceries', '2026-07-03', "Trader Joe's"],
      ],
    }), META);
    expect(data.problems).toEqual([]);
    expect(data.transactions[0].amountCents).toBe(8642);
  });

  it('ignores blank rows left at the bottom of a tab', () => {
    const data = parseSheet(sheet({
      transactions: [
        ['date', 'description', 'category', 'amount'],
        ['2026-07-03', "Trader Joe's", 'Groceries', 86.42],
        ['', '', '', ''],
        [null, null, null, null],
      ],
    }), META);
    expect(data.transactions).toHaveLength(1);
    expect(data.problems).toEqual([]);
  });
});

describe('problems, not exceptions', () => {
  it('reports an unknown category and keeps going', () => {
    const data = parseSheet(sheet({
      transactions: [
        ['date', 'description', 'category', 'amount'],
        ['2026-07-03', 'Coffee', 'Cofee', 12.5],
        ['2026-07-04', 'Lunch', 'Restaurants', 18],
      ],
    }), META);

    expect(data.transactions).toHaveLength(1);
    const problem = data.problems[0];
    expect(problem.tab).toBe('transactions');
    expect(problem.row).toBe(2);
    expect(problem.column).toBe('category');
    expect(problem.message).toContain('Cofee');
  });

  it('reports an unreadable date with the row number', () => {
    const data = parseSheet(sheet({
      transactions: [
        ['date', 'category', 'amount'],
        ['not a date', 'Groceries', 20],
      ],
    }), META);
    expect(data.transactions).toEqual([]);
    expect(data.problems[0].row).toBe(2);
    expect(data.problems[0].column).toBe('date');
  });

  it('reports a missing required column against row 1', () => {
    const data = parseSheet(sheet({
      transactions: [['date', 'category'], ['2026-07-03', 'Groceries']],
    }), META);
    const missing = data.problems.find((p) => p.column === 'amount')!;
    expect(missing.row).toBe(1);
    expect(missing.message).toContain('missing');
  });

  it('skips a balance for an unknown account, since it cannot be signed', () => {
    const data = parseSheet(sheet({
      balances: [['date', 'account_id', 'balance'], ['2026-07-31', 'nope', 100]],
    }), META);
    expect(data.balances).toEqual([]);
    expect(data.problems[0].message).toContain("isn't on the accounts tab");
  });

  it('accepts a credit balance on a card without complaining', () => {
    // You overpaid the card; it owes you. Negating it adds to net worth, which
    // is correct, so there is nothing to warn about.
    const data = parseSheet(sheet({
      balances: [['date', 'account_id', 'balance'], ['2026-07-31', 'amex', -827]],
    }), META);
    expect(data.balances[0].balanceCents).toBe(-82700);
    expect(data.problems).toEqual([]);
  });

  it('warns about a negative balance on an account that holds money', () => {
    const data = parseSheet(sheet({
      balances: [['date', 'account_id', 'balance'], ['2026-07-31', 'chk', -1345]],
    }), META);
    expect(data.balances).toHaveLength(1);
    expect(data.problems[0].severity).toBe('warning');
    expect(data.problems[0].column).toBe('balance');
  });

  it('accepts the old asset value but says it needs splitting', () => {
    const data = parseSheet(sheet({
      accounts: [['account_id', 'name', 'class'], ['old', 'Legacy', 'asset']],
    }), META);
    expect(data.accounts[0].klass).toBe('cash');
    expect(data.problems[0].severity).toBe('warning');
    expect(data.problems[0].message).toContain('investment');
  });

  it('flags a missing class loudly, since it flips the sign', () => {
    const data = parseSheet(sheet({
      accounts: [['account_id', 'name', 'class'], ['mtg', 'Mortgage', '']],
    }), META);
    expect(data.accounts[0].klass).toBe('cash');
    expect(data.problems[0].column).toBe('class');
    expect(data.problems[0].severity).toBe('error');
  });

  it('keeps the first of two duplicate account ids', () => {
    const data = parseSheet(sheet({
      accounts: [
        ['account_id', 'name', 'class'],
        ['chk', 'First', 'cash'],
        ['chk', 'Second', 'cash'],
      ],
    }), META);
    expect(data.accounts).toHaveLength(1);
    expect(data.accounts[0].name).toBe('First');
    expect(data.problems[0].message).toContain('Duplicate');
  });

  it('survives a completely empty tab', () => {
    const data = parseSheet(sheet({ transactions: [], balances: [] }), META);
    expect(data.transactions).toEqual([]);
    expect(data.balances).toEqual([]);
  });
});

describe('ordering', () => {
  it('returns transactions newest first', () => {
    const data = parseSheet(sheet({
      transactions: [
        ['date', 'category', 'amount'],
        ['2026-07-03', 'Groceries', 10],
        ['2026-07-20', 'Groceries', 20],
        ['2026-07-11', 'Groceries', 30],
      ],
    }), META);
    expect(data.transactions.map((t) => t.date)).toEqual(
      ['2026-07-20', '2026-07-11', '2026-07-03'],
    );
  });

  it('returns balances oldest first, ready for the series', () => {
    const data = parseSheet(sheet({
      balances: [
        ['date', 'account_id', 'balance'],
        ['2026-08-31', 'chk', 200],
        ['2026-06-30', 'chk', 100],
      ],
    }), META);
    expect(data.balances.map((b) => b.date)).toEqual(['2026-06-30', '2026-08-31']);
  });
});
