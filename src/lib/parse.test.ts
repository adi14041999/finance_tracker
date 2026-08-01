import { describe, it, expect } from 'vitest';
import { parseSheet, type RawSheet } from './parse';
import { sampleSheet } from './fixtures';

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
    premiums: [
      ['Month', ...Array.from({ length: 31 }, (_, i) => i + 1), 'Total'],
      ['January, 2024', 100, 0, -25, ...Array.from({ length: 28 }, () => 0), 75],
    ],
    premiums_anoosha: [
      ['Month', ...Array.from({ length: 31 }, (_, i) => i + 1), 'Total'],
    ],
    rolls: [
      ['ticker', 'rolled at (MM/DD/YY)', 'rolled from', 'rolled to', 'cost',
        'number of contracts', 'total cost', 'recovered'],
    ],
    events: [
      ['Month', 'Total', 'Realized profit & loss YTD'],
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

describe('premiums grid', () => {
  const HDR = ['Month', ...Array.from({ length: 31 }, (_, i) => i + 1), 'Total'];
  const g = (rows: unknown[][]) => parseSheet(sheet({ premiums: [HDR, ...rows] }), META);
  const days = (...v: unknown[]) => [...v, ...Array.from({ length: 31 - v.length }, () => 0)];

  it('reads a month row and recomputes its total', () => {
    const { premiums, problems } = g([['January, 2024', ...days(100, -25, 5), 80]]);
    expect(premiums).toHaveLength(1);
    expect(premiums[0].month).toBe('2024-01');
    expect(premiums[0].totalCents).toBe(8000);
    expect(problems).toEqual([]);
  });

  it('skips a repeated header row between year blocks', () => {
    // The sheet stacks 2024, 2025 and 2026 with a header in between. Rows are
    // found by looking like a month, so the headers need no special handling.
    const { premiums, problems } = g([
      ['January, 2024', ...days(10), 10],
      HDR,
      ['January, 2025', ...days(20), 20],
    ]);
    expect(premiums.map((p) => p.month)).toEqual(['2024-01', '2025-01']);
    expect(problems).toEqual([]);
  });

  it('ignores the footer average row', () => {
    const { premiums, problems } = g([
      ['January, 2024', ...days(10), 10],
      ['', ...days(), 6769.65, ''],
    ]);
    expect(premiums).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  it('treats N/A and blank as no entry, not as zero', () => {
    const { premiums } = g([['February, 2024', ...days(5), 5].map(
      (v, i) => (i === 30 || i === 31 ? 'N/A' : v),
    )]);
    // February 2024 has 29 days; days 30 and 31 are N/A and must not become 0.
    expect(premiums[0].days.some((d) => d.day > 29)).toBe(false);
  });

  it('drops a month with no cells filled in at all', () => {
    // Future months sit in the sheet with a placeholder net worth of 1. Counting
    // them would put false zeros on the chart and drag the average down.
    const { premiums, problems } = g([
      ['January, 2024', ...days(10), 10],
      ['August, 2026', ...Array.from({ length: 31 }, () => ''), 0],
    ]);
    expect(premiums.map((p) => p.month)).toEqual(['2024-01']);
    expect(problems).toEqual([]);
  });

  it('warns when the sheet Total disagrees with the day cells', () => {
    const { premiums, problems } = g([['January, 2024', ...days(100, 50), 999]]);
    expect(premiums[0].totalCents).toBe(15000); // the day cells win
    expect(problems[0].severity).toBe('warning');
    expect(problems[0].column).toBe('total');
  });

  it('warns about a figure in a day the month does not have', () => {
    const { premiums, problems } = g([['April, 2024', ...days(10), 10].map(
      (v, i) => (i === 31 ? 500 : v),
    )]);
    expect(premiums[0].days.some((d) => d.day === 31)).toBe(false);
    expect(problems[0].message).toContain('only has 30 days');
  });

  it('rejects a duplicate month instead of double-counting it', () => {
    const { premiums, problems } = g([
      ['January, 2024', ...days(10), 10],
      ['January, 2024', ...days(99), 99],
    ]);
    expect(premiums).toHaveLength(1);
    expect(premiums[0].totalCents).toBe(1000);
    expect(problems[0].message).toContain('already appears');
  });

  it('accepts short month names', () => {
    expect(g([['Jan 2024', ...days(10), 10, 305000]])[('premiums' as 'premiums')][0].month).toBe('2024-01');
  });
});

describe('two premium sheets', () => {
  const HDR = ['Month', ...Array.from({ length: 31 }, (_, i) => i + 1), 'Total'];
  const days = (...v: unknown[]) => [...v, ...Array.from({ length: 31 - v.length }, () => 0)];

  it('keeps each person on their own tab, never merged', () => {
    const data = parseSheet(sheet({
      premiums: [HDR, ['January, 2024', ...days(100), 100]],
      premiums_anoosha: [HDR, ['January, 2024', ...days(25), 25]],
    }), META);
    expect(data.premiums[0].totalCents).toBe(10_000);
    expect(data.premiumsAnoosha[0].totalCents).toBe(2_500);
  });

  it('names the right tab when one of them has a problem', () => {
    const data = parseSheet(sheet({
      premiums_anoosha: [HDR, ['January, 2024', ...days(100), 999]],
    }), META);
    expect(data.problems[0].tab).toBe('premiums_anoosha');
    expect(data.problems[0].column).toBe('total');
  });

  it('is fine with one person having no sheet at all', () => {
    const data = parseSheet(sheet({ premiums_anoosha: [] }), META);
    expect(data.premiumsAnoosha).toEqual([]);
    expect(data.problems).toEqual([]);
  });

  it('says nothing about a stray zero past the end of a month', () => {
    // Anoosha's November 2024 has 31 day columns for a 30-day month, and the
    // extra cell holds 0 — a formula dragged one column too far. Nothing is
    // missing from the total, so there is nothing worth telling her about.
    const data = parseSheet(sheet({
      premiums_anoosha: [HDR, ['November, 2024', ...days(10), 10]],
    }), META);
    expect(data.premiumsAnoosha[0].totalCents).toBe(1_000);
    expect(data.problems).toEqual([]);
  });

  it('still flags a real figure past the end of a month', () => {
    const row = days(10);
    row[30] = 500; // day 31 of a 30-day month
    const data = parseSheet(sheet({
      premiums_anoosha: [HDR, ['November, 2024', ...row, 510]],
    }), META);
    expect(data.problems.some((p) => p.message.includes('only has 30 days'))).toBe(true);
  });
});

describe('rolls', () => {
  const HDR = ['ticker', 'rolled at (MM/DD/YY)', 'rolled from', 'rolled to', 'cost',
    'number of contracts', 'total cost', 'recovered'];
  const g = (rows: unknown[][]) => parseSheet(sheet({ rolls: [HDR, ...rows] }), META);

  it('reads a roll and multiplies out the cost', () => {
    const { rolls, problems } = g([['META', '01/12/26', 490, 690, 16300.08, 4, 65200.32, 6322.56]]);
    expect(rolls).toHaveLength(1);
    expect(rolls[0].date).toBe('2026-01-12');
    expect(rolls[0].totalCostCents).toBe(6_520_032);
    expect(rolls[0].recoveredCents).toBe(632_256);
    expect(problems).toEqual([]);
  });

  it('accepts two- and four-digit years in the same column', () => {
    // The real sheet has both. Guessing one format would drop half the rows.
    const { rolls, problems } = g([
      ['CRWD', '08/04/25', 320, 465, 15150.08, 1, 15150.08, 4300.86],
      ['CRWD', '01/12/2026', 320, 470, 14440.08, 1, 14440.08, 2033.96],
    ]);
    expect(rolls.map((r) => r.date).sort()).toEqual(['2025-08-04', '2026-01-12']);
    expect(problems).toEqual([]);
  });

  it('skips the percentage rows the sheet puts under each roll', () => {
    const { rolls, problems } = g([
      ['CRWD', '08/04/25', 320, 465, 15150.08, 1, 15150.08, 4300.86],
      ['', '', '', '', '', '', '', '28.39%'],
    ]);
    expect(rolls).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  it('warns when contracts and the sheet total disagree', () => {
    const { rolls, problems } = g([['X', '01/12/26', 10, 20, 100, 3, 200, 0]]);
    expect(rolls[0].totalCostCents).toBe(30_000); // cost x contracts wins
    expect(problems[0].severity).toBe('warning');
    expect(problems[0].column).toBe('total cost');
  });

  it('defaults a missing contract count to one rather than zero', () => {
    // Zero contracts would silently make the roll free.
    const { rolls } = g([['X', '01/12/26', 10, 20, 100, '', '', 0]]);
    expect(rolls[0].contracts).toBe(1);
    expect(rolls[0].totalCostCents).toBe(10_000);
  });

  it('flags recovering more than the roll cost', () => {
    const { rolls, problems } = g([['X', '01/12/26', 10, 20, 100, 1, 100, 150]]);
    expect(rolls[0].recoveredCents).toBe(15_000);
    expect(problems[0].column).toBe('recovered');
    expect(problems[0].severity).toBe('warning');
  });

  it('skips a row whose date cannot be read', () => {
    const { rolls, problems } = g([['X', 'sometime', 10, 20, 100, 1, 100, 0]]);
    expect(rolls).toEqual([]);
    expect(problems[0].column).toBe('rolled at');
  });

  it('keeps both rolls when a ticker is rolled twice', () => {
    // Two rolls on one ticker are separate obligations, not one to merge.
    const { rolls } = g([
      ['CRWD', '08/04/25', 320, 465, 15150.08, 1, 15150.08, 4300.86],
      ['CRWD', '01/12/26', 320, 470, 14440.08, 1, 14440.08, 2033.96],
    ]);
    expect(rolls).toHaveLength(2);
  });
});

/**
 * The sample sheet goes through the same parser as the real one, so it should
 * come out spotless. It did not: `transactions.sort()` was sorting the header
 * row along with the body, which moved it to the bottom and left every column
 * "missing" — 279 problems and an empty Expenses page in demo mode, for months,
 * because nothing ever checked.
 */
describe('the sample sheet parses cleanly', () => {
  it('produces no problems at all', () => {
    const data = parseSheet(sampleSheet('2026-08-01'), META);
    expect(data.problems).toEqual([]);
  });

  it('keeps the header at the top of every tab it sorts', () => {
    const raw = sampleSheet('2026-08-01');
    expect(raw.transactions[0]).toEqual(['date', 'description', 'category', 'amount']);
  });

  it('fills every tab the app reads', () => {
    const data = parseSheet(sampleSheet('2026-08-01'), META);
    expect(data.transactions.length).toBeGreaterThan(0);
    expect(data.balances.length).toBeGreaterThan(0);
    expect(data.accounts.length).toBeGreaterThan(0);
    expect(data.positions.length).toBeGreaterThan(0);
    expect(data.premiums.length).toBeGreaterThan(0);
    expect(data.premiumsAnoosha.length).toBeGreaterThan(0);
    expect(data.rolls.length).toBeGreaterThan(0);
    expect(data.events.length).toBeGreaterThan(0);
  });

  it('is deterministic, so the demo never shifts under you', () => {
    const a = parseSheet(sampleSheet('2026-08-01'), META);
    const b = parseSheet(sampleSheet('2026-08-01'), META);
    expect(b.transactions.length).toBe(a.transactions.length);
    expect(b.positions).toEqual(a.positions);
  });
});
