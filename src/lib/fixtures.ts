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
  Rent: [1, 2400, 0, ['Monthly rent']],
  Utilities: [2, 85, 40, ['PG&E', 'Comcast', 'Water']],
  Groceries: [6, 78, 45, ["Trader Joe's", 'Safeway', 'Whole Foods', 'Costco']],
  Restaurants: [7, 42, 30, ['Tartine', 'Zuni Cafe', 'Sushi Ran', 'Taqueria', 'Blue Bottle']],
  Car: [2, 120, 80, ['Shell', 'Insurance', 'Parking', 'Oil change']],
  'Uber/Lyft': [5, 24, 14, ['Uber', 'Lyft']],
  'Public transportation': [3, 22, 8, ['BART', 'Clipper top-up', 'Muni']],
  Flights: [0.4, 420, 180, ['United', 'Alaska', 'Delta']],
  Hotels: [0.3, 310, 140, ['Marriott', 'Airbnb', 'Kimpton']],
  Subscriptions: [5, 16, 9, ['Spotify', 'Netflix', 'iCloud', 'NYT', 'Claude']],
  Compute: [3, 190, 130, ['Lambda Labs', 'RunPod', 'Vast.ai', 'CoreWeave']],
  Courses: [0.5, 240, 120, ['Coursera', 'O’Reilly', 'Frontend Masters']],
  'Amazon/Walmart': [5, 58, 45, ['Amazon', 'Walmart', 'Target']],
  Fitness: [1.2, 95, 35, ['Equinox', 'Climbing gym', 'Yoga studio']],
  Immigration: [0.25, 640, 300, ['USCIS filing fee', 'Attorney']],
  Fees: [1.5, 28, 20, ['Wire fee', 'ATM fee', 'FX fee', 'Late fee']],
  Miscellaneous: [2, 45, 35, ['Gift', 'Pharmacy', 'Dry cleaning', 'Haircut']],
};

const ACCOUNTS = [
  ['chk_main', 'Everyday Checking', 'asset', 'TRUE'],
  ['sav_hys', 'High Yield Savings', 'asset', 'TRUE'],
  ['brk_rh', 'Robinhood', 'asset', 'TRUE'],
  ['ret_401k', '401(k)', 'asset', 'TRUE'],
  ['cc_amex', 'Amex Gold', 'liability', 'TRUE'],
  ['loan_car', 'Car Loan', 'liability', 'TRUE'],
];

const HOLDINGS = [
  ['brk_rh', 'VTI', 'Vanguard Total US Market', 'us_equity', 142.5, 305.4, 43519.5, 34200],
  ['brk_rh', 'VXUS', 'Vanguard Total International', 'intl_equity', 310, 68.22, 21148.2, 19100],
  ['brk_rh', 'NVDA', 'NVIDIA', 'us_equity', 45, 178.3, 8023.5, 4900],
  ['brk_rh', 'CASH', 'Settlement fund', 'cash', 3200, 1, 3200, 3200],
  ['ret_401k', 'BND', 'Vanguard Total Bond', 'bond', 180, 73.1, 13158, 13500],
  ['ret_401k', 'VTI', 'Vanguard Total US Market', 'us_equity', 210, 305.4, 64134, 51000],
];

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

  transactions.sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  // Balances: a plausible upward drift with a wobble, debts shrinking.
  const balances: unknown[][] = [['date', 'account_id', 'balance']];
  const start: Record<string, number> = {
    chk_main: 7800, sav_hys: 21000, brk_rh: 61000,
    ret_401k: 68000, cc_amex: 2100, loan_car: 14800,
  };
  const drift: Record<string, number> = {
    chk_main: 180, sav_hys: 900, brk_rh: 2100,
    ret_401k: 1400, cc_amex: -40, loan_car: -420,
  };

  months.forEach((month, i) => {
    const dim = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
    const isCurrent = month === currentMonth;
    const day = isCurrent ? Math.max(1, Number(today.slice(8, 10))) : dim;

    for (const [accountId, base] of Object.entries(start)) {
      const wobble = (random() - 0.5) * (accountId === 'brk_rh' ? 3400 : 700);
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
    Rent: 2400, Utilities: 180, Groceries: 550, Restaurants: 300,
    Car: 220, 'Uber/Lyft': 120, Subscriptions: 90, Compute: 500,
    'Amazon/Walmart': 300, Fitness: 120, Flights: 250, Miscellaneous: 120,
  };
  for (const month of months.slice(-4)) {
    for (const [category, amount] of Object.entries(targets)) {
      budgets.push([month, category, amount]);
    }
  }

  return {
    accounts: [['account_id', 'name', 'class', 'active'], ...ACCOUNTS],
    categories: [['category'], ...CATEGORY_ROWS],
    transactions,
    balances,
    budgets,
    holdings: [
      ['account_id', 'ticker', 'name', 'asset_class', 'quantity', 'price', 'market_value', 'cost_basis'],
      ...HOLDINGS,
    ],
    config: [
      ['key', 'value', 'description'],
      ['monthly_spend_target', 5000, ''],
      ['annual_spend_target', 60000, ''],
      ['net_worth_goal', 1000000, ''],
      ['concentration_warn_pct', 0.25, ''],
      ['start_month', months[0], ''],
    ],
  };
}
