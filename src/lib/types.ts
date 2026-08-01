/**
 * The shape of everything that comes out of the Google Sheet, after parsing.
 *
 * Every monetary value in this file is an INTEGER NUMBER OF CENTS. Never a float.
 * See money.ts for why, and for the helpers that convert at the boundaries.
 */

/**
 * Three buckets, one column. Cash and investment are both assets — the split
 * exists because money you can spend this afternoon and money that is locked
 * in a 401(k) answer different questions, even though they add up the same.
 */
export type AccountClass = 'cash' | 'investment' | 'liability';

export interface Account {
  accountId: string;
  name: string;
  klass: AccountClass;
}

/** Just the list of valid category names. The sheet's dropdowns read from it,
 *  and the parser rejects any transaction whose category isn't in here. */
export interface Category {
  category: string;
}

/** One expense. Positive cents = money spent. Negative = a refund. */
export interface Transaction {
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM, derived at parse time
  description: string;
  category: string;
  amountCents: number;
  row: number; // 1-indexed sheet row, for error messages
}

export interface Balance {
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  accountId: string;
  balanceCents: number; // always positive as entered; sign applied at derive time
  row: number;
}

export interface Budget {
  month: string; // YYYY-MM
  category: string;
  amountCents: number;
  row: number;
}

export interface Holding {
  accountId: string;
  ticker: string;
  name: string;
  assetClass: string;
  quantity: number;
  priceCents: number;
  marketValueCents: number;
  costBasisCents: number | null;
  row: number;
}

export interface Config {
  monthlySpendTargetCents: number | null;
  annualSpendTargetCents: number | null;
  netWorthGoalCents: number | null;
  concentrationWarnPct: number | null;
  startMonth: string | null;
}

/**
 * A row we could not make sense of. These never throw — they surface in the
 * Settings panel with the exact tab and row so you know what to go fix.
 */
export interface Problem {
  tab: string;
  row: number;
  column: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface SheetData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  balances: Balance[];
  budgets: Budget[];
  holdings: Holding[];
  config: Config;
  problems: Problem[];
  fetchedAt: string; // ISO timestamp
  source: 'sheet' | 'sample';
}
