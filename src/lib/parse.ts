/**
 * Turns raw sheet rows into typed data, collecting problems instead of throwing.
 *
 * The guiding principle: one bad row must never take down the page. A typo in
 * a category name should cost you that row and a line in the Settings panel
 * telling you exactly where to look — not a stack trace.
 *
 * Columns are located by header name rather than position, so if a column ever
 * does get moved the app keeps working.
 */

import type {
  Account, AccountClass, Balance, Budget, Category,
  Config, Holding, Problem, SheetData, Transaction,
} from './types';
import { toCents } from './money';
import { monthOf, normaliseDate, normaliseMonth } from './dates';

export type RawRows = unknown[][];

export interface RawSheet {
  accounts: RawRows;
  categories: RawRows;
  transactions: RawRows;
  balances: RawRows;
  budgets: RawRows;
  holdings: RawRows;
  config: RawRows;
}

class Reader {
  private index = new Map<string, number>();
  private tab: string;
  readonly problems: Problem[] = [];

  constructor(tab: string, header: unknown[]) {
    this.tab = tab;
    header.forEach((h, i) => {
      const key = String(h ?? '').trim().toLowerCase();
      if (key && !this.index.has(key)) this.index.set(key, i);
    });
  }

  has(column: string): boolean {
    return this.index.has(column);
  }

  raw(row: unknown[], column: string): unknown {
    const i = this.index.get(column);
    return i === undefined ? undefined : row[i];
  }

  text(row: unknown[], column: string): string {
    const v = this.raw(row, column);
    return v === null || v === undefined ? '' : String(v).trim();
  }

  bool(row: unknown[], column: string, fallback = false): boolean {
    const v = this.text(row, column).toLowerCase();
    if (v === '') return fallback;
    return v === 'true' || v === 'yes' || v === 'y' || v === '1';
  }

  problem(rowNumber: number, column: string, message: string, severity: Problem['severity'] = 'error') {
    this.problems.push({ tab: this.tab, row: rowNumber, column, message, severity });
  }

  missingColumns(required: string[], into: Problem[]) {
    for (const c of required) {
      if (!this.has(c)) {
        into.push({
          tab: this.tab, row: 1, column: c, severity: 'error',
          message: `The "${c}" column is missing. The app looks for it by name in row 1.`,
        });
      }
    }
  }
}

/** Rows that are entirely blank — trailing whitespace in the sheet, basically. */
function isBlank(row: unknown[]): boolean {
  return row.every((c) => c === null || c === undefined || String(c).trim() === '');
}

function body(rows: RawRows): { row: unknown[]; n: number }[] {
  return rows
    .slice(1)
    .map((row, i) => ({ row, n: i + 2 })) // +2: 1-indexed, and row 1 is the header
    .filter(({ row }) => !isBlank(row));
}

function parseAccounts(rows: RawRows, problems: Problem[]): Account[] {
  if (rows.length === 0) return [];
  const r = new Reader('accounts', rows[0]);
  r.missingColumns(['account_id', 'name', 'class'], problems);

  const out: Account[] = [];
  const seen = new Set<string>();

  for (const { row, n } of body(rows)) {
    const accountId = r.text(row, 'account_id');
    if (!accountId) {
      r.problem(n, 'account_id', 'Blank account_id, so this row was skipped.');
      continue;
    }
    if (seen.has(accountId)) {
      r.problem(n, 'account_id', `Duplicate account_id "${accountId}". Only the first row is used.`);
      continue;
    }
    seen.add(accountId);

    const classText = r.text(row, 'class').toLowerCase();
    let klass: AccountClass;
    if (classText === 'cash' || classText === 'investment' || classText === 'liability') {
      klass = classText;
    } else if (classText === 'asset') {
      // An older sheet used asset/liability. Keep it working, but say so —
      // "asset" can't tell us whether it's spendable or locked away.
      klass = 'cash';
      r.problem(n, 'class', 'The "asset" class was split into "cash" and "investment". Treating this as cash — change it if it belongs under investments.', 'warning');
    } else {
      // This one really matters: guessing wrong flips the sign of every balance
      // for this account. Default to asset, but say so loudly rather than
      // quietly turning a mortgage into savings.
      klass = 'cash';
      r.problem(n, 'class', `Expected "cash", "investment" or "liability" but found "${classText || 'nothing'}". Treating it as cash — if this is a debt, fix it or your net worth is wrong by twice the balance.`);
    }

    out.push({ accountId, name: r.text(row, 'name') || accountId, klass });
  }

  problems.push(...r.problems);
  return out;
}

function parseCategories(rows: RawRows, problems: Problem[]): Category[] {
  if (rows.length === 0) return [];
  const r = new Reader('categories', rows[0]);
  r.missingColumns(['category'], problems);

  const out: Category[] = [];
  const seen = new Set<string>();

  for (const { row, n } of body(rows)) {
    const category = r.text(row, 'category');
    if (!category) continue;
    if (seen.has(category)) {
      r.problem(n, 'category', `Duplicate category "${category}". Only the first row is used.`);
      continue;
    }
    seen.add(category);
    out.push({ category });
  }

  problems.push(...r.problems);
  return out;
}

function parseTransactions(rows: RawRows, categories: Category[], problems: Problem[]): Transaction[] {
  if (rows.length === 0) return [];
  const r = new Reader('transactions', rows[0]);
  r.missingColumns(['date', 'category', 'amount'], problems);

  const knownCategories = new Set(categories.map((c) => c.category));
  const out: Transaction[] = [];

  for (const { row, n } of body(rows)) {
    const date = normaliseDate(r.raw(row, 'date'));
    if (!date) {
      r.problem(n, 'date', `Couldn't read "${r.text(row, 'date')}" as a date. Expected YYYY-MM-DD. Row skipped.`);
      continue;
    }

    const amountCents = toCents(r.raw(row, 'amount'));
    if (amountCents === null) {
      r.problem(n, 'amount', `Couldn't read "${r.text(row, 'amount')}" as an amount. Row skipped.`);
      continue;
    }

    const category = r.text(row, 'category');
    if (!category) {
      r.problem(n, 'category', 'No category, so this row is left out of every total.');
      continue;
    }
    if (!knownCategories.has(category)) {
      r.problem(n, 'category', `"${category}" isn't on the categories tab. Add it there, or fix the spelling. Row skipped.`);
      continue;
    }

    out.push({
      date,
      month: monthOf(date),
      description: r.text(row, 'description'),
      category,
      amountCents,
      row: n,
    });
  }

  problems.push(...r.problems);
  return out;
}

function parseBalances(rows: RawRows, accounts: Account[], problems: Problem[]): Balance[] {
  if (rows.length === 0) return [];
  const r = new Reader('balances', rows[0]);
  r.missingColumns(['date', 'account_id', 'balance'], problems);

  const classOf = new Map(accounts.map((a) => [a.accountId, a.klass]));
  const out: Balance[] = [];

  for (const { row, n } of body(rows)) {
    const date = normaliseDate(r.raw(row, 'date'));
    if (!date) {
      r.problem(n, 'date', `Couldn't read "${r.text(row, 'date')}" as a date. Row skipped.`);
      continue;
    }
    const accountId = r.text(row, 'account_id');
    if (!accountId) {
      r.problem(n, 'account_id', 'Blank account_id. Row skipped.');
      continue;
    }
    if (!classOf.has(accountId)) {
      r.problem(n, 'account_id', `"${accountId}" isn't on the accounts tab, so it can't be counted as an asset or a debt. Row skipped.`);
      continue;
    }
    const balanceCents = toCents(r.raw(row, 'balance'));
    if (balanceCents === null) {
      r.problem(n, 'balance', `Couldn't read "${r.text(row, 'balance')}" as an amount. Row skipped.`);
      continue;
    }
    // A negative balance means different things by account class. On a credit
    // card it's a credit balance — you overpaid, and the card owes you — which
    // is perfectly normal and correctly adds to net worth once negated. On cash
    // or investments it's odd enough to be worth a look.
    if (balanceCents < 0 && classOf.get(accountId) !== 'liability') {
      r.problem(n, 'balance', 'Negative balance on an account that should hold money. If this is a debt, its class on the accounts tab is wrong.', 'warning');
    }

    out.push({ date, month: monthOf(date), accountId, balanceCents, row: n });
  }

  problems.push(...r.problems);
  return out;
}

function parseBudgets(rows: RawRows, categories: Category[], problems: Problem[]): Budget[] {
  if (rows.length === 0) return [];
  const r = new Reader('budgets', rows[0]);
  r.missingColumns(['month', 'category', 'amount'], problems);

  const known = new Set(categories.map((c) => c.category));
  const out: Budget[] = [];

  for (const { row, n } of body(rows)) {
    const month = normaliseMonth(r.raw(row, 'month'));
    if (!month) {
      r.problem(n, 'month', `Couldn't read "${r.text(row, 'month')}" as a month. Expected YYYY-MM. Row skipped.`);
      continue;
    }
    const category = r.text(row, 'category');
    if (!known.has(category)) {
      r.problem(n, 'category', `"${category}" isn't on the categories tab. Row skipped.`);
      continue;
    }
    const amountCents = toCents(r.raw(row, 'amount'));
    if (amountCents === null) {
      r.problem(n, 'amount', `Couldn't read "${r.text(row, 'amount')}" as an amount. Row skipped.`);
      continue;
    }
    out.push({ month, category, amountCents, row: n });
  }

  problems.push(...r.problems);
  return out;
}

function parseHoldings(rows: RawRows, problems: Problem[]): Holding[] {
  if (rows.length === 0) return [];
  const r = new Reader('holdings', rows[0]);
  const out: Holding[] = [];

  for (const { row, n } of body(rows)) {
    const ticker = r.text(row, 'ticker');
    if (!ticker) continue;

    const quantityRaw = r.text(row, 'quantity');
    const quantity = Number(quantityRaw.replace(/,/g, ''));
    const priceCents = toCents(r.raw(row, 'price'));
    const marketValueCents = toCents(r.raw(row, 'market_value'));

    if (!Number.isFinite(quantity)) {
      r.problem(n, 'quantity', `Couldn't read "${quantityRaw}" as a number. Row skipped.`);
      continue;
    }
    if (priceCents === null && marketValueCents === null) {
      // Almost always the GOOGLEFINANCE formula erroring or still loading.
      r.problem(n, 'price', `No price or market value for ${ticker}. If the GOOGLEFINANCE formula shows an error, the ticker may be wrong.`, 'warning');
    }

    out.push({
      accountId: r.text(row, 'account_id'),
      ticker,
      name: r.text(row, 'name'),
      assetClass: r.text(row, 'asset_class') || 'other',
      quantity,
      priceCents: priceCents ?? 0,
      marketValueCents: marketValueCents ?? Math.round((priceCents ?? 0) * quantity),
      costBasisCents: toCents(r.raw(row, 'cost_basis')),
      row: n,
    });
  }

  problems.push(...r.problems);
  return out;
}

function parseConfig(rows: RawRows): Config {
  const map = new Map<string, string>();
  for (const row of rows.slice(1)) {
    const key = String(row[0] ?? '').trim();
    if (key) map.set(key, String(row[1] ?? '').trim());
  }
  const cents = (key: string) => toCents(map.get(key));
  const fraction = (key: string) => {
    const raw = map.get(key);
    if (!raw) return null;
    const n = Number(raw.replace('%', ''));
    if (!Number.isFinite(n)) return null;
    // Tolerate either 0.25 or 25 for a quarter.
    return n > 1 ? n / 100 : n;
  };

  return {
    monthlySpendTargetCents: cents('monthly_spend_target'),
    annualSpendTargetCents: cents('annual_spend_target'),
    netWorthGoalCents: cents('net_worth_goal'),
    concentrationWarnPct: fraction('concentration_warn_pct'),
    startMonth: normaliseMonth(map.get('start_month')),
  };
}

export function parseSheet(
  raw: RawSheet,
  meta: { fetchedAt: string; source: 'sheet' | 'sample' },
): SheetData {
  const problems: Problem[] = [];

  // Order matters: transactions and balances validate against these.
  const accounts = parseAccounts(raw.accounts, problems);
  const categories = parseCategories(raw.categories, problems);

  const transactions = parseTransactions(raw.transactions, categories, problems);
  const balances = parseBalances(raw.balances, accounts, problems);
  const budgets = parseBudgets(raw.budgets, categories, problems);
  const holdings = parseHoldings(raw.holdings, problems);
  const config = parseConfig(raw.config);

  transactions.sort((a, b) => b.date.localeCompare(a.date) || b.row - a.row);
  balances.sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row);

  problems.sort(
    (a, b) => a.tab.localeCompare(b.tab) || a.row - b.row || a.column.localeCompare(b.column),
  );

  return {
    accounts, categories, transactions, balances, budgets, holdings, config,
    problems, ...meta,
  };
}
