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

/**
 * One ticker on the recovery ledger.
 *
 * Two independent things live in a single row, and keeping them straight is the
 * whole point of this type:
 *
 *   `recoverCents` is a REALIZED loss. Money already lost on trades that are
 *   closed and settled. It is history, and no price movement changes it — only
 *   editing the sheet does.
 *
 *   `meanCents` and `units` describe a position held RIGHT NOW, which is the
 *   vehicle for earning that history back. Its gain is unrealized until sold.
 *
 * A row can have either, both, or — for a name that's closed with nothing owed —
 * neither, in which case it carries no information and is skipped. When mean and
 * units are absent but a recover figure is present, the loss is real but there
 * is no position behind it, so there is no price at which it comes back.
 */
export interface Position {
  ticker: string;
  recoverCents: number;
  meanCents: number | null; // weighted average cost per share
  units: number | null; // fractional shares are normal, so this is a float
  priceCents: number | null; // live, via GOOGLEFINANCE; null when unavailable
  row: number;
}

export interface Config {
  monthlySpendTargetCents: number | null;
  annualSpendTargetCents: number | null;
  netWorthGoalCents: number | null;
  concentrationWarnPct: number | null;
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
  positions: Position[];
  config: Config;
  problems: Problem[];
  fetchedAt: string; // ISO timestamp
  source: 'sheet' | 'sample';
}
