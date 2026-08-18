/**
 * Sample data, so the app is worth looking at before any Google setup exists.
 *
 * This is generated in the same raw shape the Sheets API returns and goes
 * through the identical parser, so sample mode exercises the real code path
 * rather than a parallel one that could drift out of sync.
 *
 * The numbers come from a seeded pseudo-random generator: deterministic, so
 * the app looks the same on every reload and screenshots stay stable.
 */

import type { RawSheet } from './parse';
import { addMonths, daysInMonth } from './dates';

/** mulberry32 — small, fast, and good enough for plausible-looking noise. */
function rng(seed: number) {
  return function next(): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORY_ROWS = [
  ['Rent'],
  ['Utilities'],
  ['Groceries'],
  ['Restaurants'],
  ['Car'],
  ['Uber/Lyft'],
  ['Public transportation'],
  ['Flights'],
  ['Hotels'],
  ['Subscriptions'],
  ['Compute'],
  ['Courses'],
  ['Amazon/Walmart'],
  ['Fitness'],
  ['Immigration'],
  ['Fees'],
  ['Miscellaneous'],
];

/** category -> [times per month, typical amount, spread, merchant names] */
const HABITS: Record<string, [number, number, number, string[]]> = {
  Rent: [1, 1650, 0, ['Monthly rent']],
  Utilities: [2, 85, 40, ['PG&E', 'Comcast', 'Water']],
  Groceries: [5, 62, 30, ["Trader Joe's", 'Safeway', 'Whole Foods', 'Costco']],
  Restaurants: [5, 31, 18, ['Tartine', 'Zuni Cafe', 'Sushi Ran', 'Taqueria', 'Blue Bottle']],
  Car: [2, 120, 80, ['Shell', 'Insurance', 'Parking', 'Oil change']],
  'Uber/Lyft': [5, 24, 14, ['Uber', 'Lyft']],
  'Public transportation': [3, 22, 8, ['BART', 'Clipper top-up', 'Muni']],
  Flights: [0.3, 260, 90, ['United', 'Alaska', 'Delta']],
  Hotels: [0.2, 180, 70, ['Marriott', 'Airbnb', 'Kimpton']],
  Subscriptions: [5, 16, 9, ['Spotify', 'Netflix', 'iCloud', 'NYT', 'Claude']],
  Compute: [1, 45, 30, ['Lambda Labs', 'RunPod', 'Vast.ai', 'CoreWeave']],
  Courses: [0.5, 240, 120, ['Coursera', 'O’Reilly', 'Frontend Masters']],
  'Amazon/Walmart': [4, 39, 25, ['Amazon', 'Walmart', 'Target']],
  Fitness: [1, 48, 12, ['Equinox', 'Climbing gym', 'Yoga studio']],
  Immigration: [0.15, 390, 140, ['USCIS filing fee', 'Attorney']],
  Fees: [1.5, 28, 20, ['Wire fee', 'ATM fee', 'FX fee', 'Late fee']],
  Miscellaneous: [2, 45, 35, ['Gift', 'Pharmacy', 'Dry cleaning', 'Haircut']],
};

const ACCOUNTS = [
  ['chk_main', 'Everyday Checking', 'cash'],
  ['sav_hys', 'High Yield Savings', 'cash'],
  ['brk_rh', 'Robinhood', 'investment'],
  ['ret_401k', '401(k)', 'investment'],
  ['cc_amex', 'Amex Gold', 'liability'],
  ['loan_car', 'Car Loan', 'liability'],
];

/**
 * ticker, recover, mean, units, price.
 *
 * Deliberately nothing like any real ledger this app might be pointed at:
 * different tickers, a different order of magnitude, and a different shape —
 * the sample book is mostly recovered rather than mostly outstanding.
 *
 * It still exercises every branch: one name past break-even, one under water,
 * one owing nothing, two closed with no position behind them, and one whose
 * price is blank the way GOOGLEFINANCE leaves it for a ticker it can't resolve.
 */
const POSITIONS = [
  ['AAPL', 4200, 176.4, 60, 214.8],
  ['DIS', 9750, 118.25, 150, 96.4],
  ['KO', 0, 61.8, 220, 68.15],
  ['ORCL', 1800, 132.5, 40, 149.9],
  ['INTC', 3100, 44.9, 200, 27.35],
  ['NKE', 2400, '', '', ''],
  ['SBUX', 660, '', '', ''],
  ['ZZZZ', 300, '', '', ''],
];

/**
 * Premiums in the same wide month-by-day shape the real sheet uses: a row per
 * month, columns 1..31, and N/A where the month runs short. Mostly small
 * positive days with the occasional bad one, so the demo exercises the
 * diverging scale and the drawdown path rather than a tidy upward line.
 */
function premiumGrid(months: string[], random: () => number): unknown[][] {
  const header = ['Month', ...Array.from({ length: 31 }, (_, i) => i + 1), 'Total'];
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const rows: unknown[][] = [header];
  for (const month of months) {
    const year = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const dim = daysInMonth(year, m);
    const cells: unknown[] = [];
    let total = 0;
    for (let d = 1; d <= 31; d++) {
      if (d > dim) { cells.push('N/A'); continue; }
      let v = 0;
      if (random() < 0.4) {
        v = random() < 0.07
          ? -Math.round(random() * 24000) / 100
          : Math.round(random() * 21000) / 100;
      }
      total += v;
      cells.push(v);
    }
    rows.push([`${names[m - 1]}, ${year}`, ...cells, Math.round(total * 100) / 100]);
  }
  return rows;
}

/**
 * `today` is passed in so the sample data always ends at the current month —
 * an app whose demo data stops in 2024 looks broken.
 */
export function sampleSheet(today: string): RawSheet {
  const random = rng(20260731);
  const currentMonth = today.slice(0, 7);
  const months: string[] = [];
  for (let i = 7; i >= 0; i--) months.push(addMonths(currentMonth, -i));

  const transactions: unknown[][] = [
    ['date', 'description', 'category', 'amount'],
  ];

  for (const month of months) {
    const isCurrent = month === currentMonth;
    const dim = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
    // Only fill the current month up to today, so the pace meter reads true.
    const lastDay = isCurrent ? Math.max(1, Number(today.slice(8, 10))) : dim;

    for (const [category, [perMonth, typical, spread, merchants]] of Object.entries(HABITS)) {
      const scale = isCurrent ? lastDay / dim : 1;
      let count = Math.floor(perMonth * scale);
      if (random() < (perMonth * scale) % 1) count += 1;

      for (let i = 0; i < count; i++) {
        const day = Math.min(lastDay, 1 + Math.floor(random() * lastDay));
        const amount = Math.max(3, typical + (random() - 0.5) * 2 * spread);
        const merchant = merchants[Math.floor(random() * merchants.length)];
        transactions.push([
          `${month}-${String(day).padStart(2, '0')}`,
          merchant,
          category,
          Math.round(amount * 100) / 100,
        ]);
      }
    }

    // A refund every few months, so the negative path is visible in the demo.
    if (random() < 0.4) {
      transactions.push([
        `${month}-${String(Math.min(lastDay, 22)).padStart(2, '0')}`,
        'Returned item', 'Amazon/Walmart',
        -Math.round((30 + random() * 90) * 100) / 100,
      ]);
    }
  }

  // Sort the BODY only. Sorting the whole array moves the header row, because
  // "date" orders after "2026-01-05" — which silently left the sample sheet
  // with no header and every column reported missing.
  const [txHeader, ...txBody] = transactions;
  txBody.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const sortedTransactions = [txHeader, ...txBody];

  // Balances: a plausible upward drift with a wobble, debts shrinking.
  const balances: unknown[][] = [['date', 'account_id', 'balance']];
  const start: Record<string, number> = {
    chk_main: 3150, sav_hys: 8600, brk_rh: 19400,
    ret_401k: 27300, cc_amex: 740, loan_car: 5900,
  };
  const drift: Record<string, number> = {
    chk_main: 60, sav_hys: 310, brk_rh: 540,
    ret_401k: 420, cc_amex: -15, loan_car: -180,
  };

  months.forEach((month, i) => {
    const dim = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
    const isCurrent = month === currentMonth;
    const day = isCurrent ? Math.max(1, Number(today.slice(8, 10))) : dim;

    for (const [accountId, base] of Object.entries(start)) {
      const wobble = (random() - 0.5) * (accountId === 'brk_rh' ? 900 : 220);
      const value = Math.max(50, base + drift[accountId] * i + wobble);
      balances.push([
        `${month}-${String(day).padStart(2, '0')}`,
        accountId,
        Math.round(value * 100) / 100,
      ]);
    }
  });

  const budgets: unknown[][] = [['month', 'category', 'amount']];
  const targets: Record<string, number> = {
    Rent: 1650, Utilities: 140, Groceries: 340, Restaurants: 190,
    Car: 160, 'Uber/Lyft': 70, Subscriptions: 60, Compute: 60,
    'Amazon/Walmart': 170, Fitness: 55, Flights: 90, Miscellaneous: 80,
  };
  for (const month of months.slice(-4)) {
    for (const [category, amount] of Object.entries(targets)) {
      budgets.push([month, category, amount]);
    }
  }

  return {
    accounts: [['account_id', 'name', 'class'], ...ACCOUNTS],
    categories: [['category'], ...CATEGORY_ROWS],
    transactions: sortedTransactions,
    balances,
    budgets,
    positions: [
      ['ticker', 'recover', 'mean', 'units', 'price'],
      ...POSITIONS,
    ],
    premiums: premiumGrid(months, random),
    premiums_anoosha: premiumGrid(months, random),
    rolls: [
      ['ticker', 'rolled at (MM/DD/YY)', 'rolled from', 'rolled to', 'cost',
        'number of contracts', 'total cost', 'recovered'],
      ['AAPL', '03/21/26', 190, 215, 1240.5, 2, 2481, 1655.2],
      ['ORCL', '03/21/26', 140, 165, 880.25, 1, 880.25, 880.25],
      ['DIS', '11/15/25', 105, 125, 610.4, 3, 1831.2, 402.6],
      ['KO', '11/15/25', 62.5, 'buy to close', 305.6, 2, 611.2, 120],
    ],
    events: [
      ['Month', 'Total', 'Realized profit & loss YTD'],
      ['January, 2026', 240, 240],
      ['February, 2026', -1310, -1070],
      ['March, 2026', 0, -1070],
      ['April, 2026', 815, -255],
      ['May, 2026', -420, -675],
      ['June, 2026', 1960, 1285],
    ],
    margin: [
      ['date', 'margin'],
      ['2026-07-06', 14200],
      ['2026-07-13', 12750],
      ['2026-07-20', 13100],
      ['2026-07-27', 9400],
      ['2026-08-03', 7850],
    ],
    mission: [
      ['date', 'amount'],
      ['2026-08-17', 310],
      ['2026-08-18', 0],
      ['2026-08-19', 420],
      ['2026-08-20', 185],
    ],
    config: [
      ['key', 'value', 'description'],
      ['monthly_spend_target', 3200, ''],
      ['annual_spend_target', 38400, ''],
      ['net_worth_goal', 250000, ''],
      ['concentration_warn_pct', 0.25, ''],
    ],
  };
}
