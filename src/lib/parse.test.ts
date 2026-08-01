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
    positions: [
      ['ticker', 'recover', 'mean', 'units', 'price'],
      ['NVDA', 19396, 128.75, 200.24, 181.4],
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

describe('positions', () => {
  const p = (rows: unknown[][]) =>
    parseSheet(sheet({ positions: [['ticker', 'recover', 'mean', 'units', 'price'], ...rows] }), META);

  it('reads a held position', () => {
    const { positions } = p([['META', 205096, 350, 500.86, 712.4]]);
    expect(positions).toHaveLength(1);
    expect(positions[0].recoverCents).toBe(20_509_600);
    expect(positions[0].meanCents).toBe(35_000);
    expect(positions[0].units).toBe(500.86);
    expect(positions[0].priceCents).toBe(71_240);
  });

  it('reads a closed position as a debt with no vehicle', () => {
    const { positions, problems } = p([['ENPH', 20001, '', '', '']]);
    expect(positions[0].meanCents).toBeNull();
    expect(positions[0].units).toBeNull();
    expect(positions[0].recoverCents).toBe(2_000_100);
    expect(problems).toEqual([]);
  });

  it('skips the SUM row at the bottom without complaining about it', () => {
    // A blank ticker with a total beside it is a deliberate thing people put in
    // sheets. Warning about it would make the problems list worth ignoring.
    const { positions, problems } = p([['AAL', 500, '', ''], ['', 422956, '', '']]);
    expect(positions.map((x) => x.ticker)).toEqual(['AAL']);
    expect(problems).toEqual([]);
  });

  it('treats zero units as no position', () => {
    const { positions } = p([['X', 500, 12, 0]]);
    expect(positions[0].units).toBeNull();
  });

  it('flags a half-filled row rather than inventing a break-even price', () => {
    const { positions, problems } = p([['X', 5000, 12, '']]);
    expect(problems).toHaveLength(1);
    expect(problems[0].column).toBe('units');
    expect(problems[0].severity).toBe('warning');
    // The debt survives; only the position claim is dropped.
    expect(positions[0].recoverCents).toBe(500_000);
    expect(positions[0].meanCents).toBeNull();
  });

  it('rejects a duplicate ticker instead of double-counting it', () => {
    const { positions, problems } = p([['AAL', 500, '', ''], ['AAL', 700, '', '']]);
    expect(positions).toHaveLength(1);
    expect(positions[0].recoverCents).toBe(50_000);
    expect(problems[0].message).toContain('already appears on row 2');
  });

  it('drops a row that owes nothing and holds nothing', () => {
    const { positions, problems } = p([['GONE', 0, '', '']]);
    expect(positions).toEqual([]);
    expect(problems).toEqual([]);
  });

  it('uppercases tickers so casing in the sheet cannot split a name', () => {
    const { positions, problems } = p([['meta', 100, '', ''], ['META', 200, '', '']]);
    expect(positions).toHaveLength(1);
    expect(problems).toHaveLength(1);
  });

  it('leaves price null when GOOGLEFINANCE has not resolved', () => {
    const { positions } = p([['X', 500, 12, 100, '']]);
    expect(positions[0].priceCents).toBeNull();
    expect(positions[0].units).toBe(100);
  });

  it('rejects negative units rather than modelling a short', () => {
    const { positions, problems } = p([['X', 500, 12, -100]]);
    expect(positions).toEqual([]);
    expect(problems[0].column).toBe('units');
  });
});
