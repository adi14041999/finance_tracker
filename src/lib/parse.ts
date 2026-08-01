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
  Config, EventMonth, Position, PremiumMonth, Problem, Roll, SheetData, Transaction,
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
  positions: RawRows;
  premiums: RawRows;
  premiums_anoosha: RawRows;
  rolls: RawRows;
  events: RawRows;
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
    // A negative balance is NOT flagged, on any class.
    //
    // It used to be, for cash and investment accounts, on the theory that it
    // meant a debt had been classed as an asset. But an account that settles
    // between people — Splitwise, Venmo — legitimately swings both ways, and
    // one perfectly correct row was firing a warning every single load. A
    // warning that cries wolf on good data teaches you to skim past the
    // problems list, which costs more than the case it was guarding.
    //
    // The misclassification risk is still covered where it actually starts:
    // parseAccounts raises an ERROR when a class is missing or unrecognised,
    // which is the moment a mortgage could become savings.

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

/** Share counts, which unlike money are genuinely fractional. */
function toUnits(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  return n;
}

function parsePositions(rows: RawRows, problems: Problem[]): Position[] {
  if (rows.length === 0) return [];
  const r = new Reader('positions', rows[0]);
  r.missingColumns(['ticker', 'recover'], problems);

  const out: Position[] = [];
  const seen = new Map<string, number>();

  for (const { row, n } of body(rows)) {
    const ticker = r.text(row, 'ticker').toUpperCase();

    // A blank ticker is almost always a SUM row or spacing at the bottom of the
    // range. Skipping it silently is deliberate: warning about the total row
    // you deliberately put there would train you to ignore the problems list.
    if (!ticker) continue;

    const first = seen.get(ticker);
    if (first !== undefined) {
      r.problem(n, 'ticker', `${ticker} already appears on row ${first}. One row per ticker — combine them, or the totals double-count. Row skipped.`);
      continue;
    }
    seen.set(ticker, n);

    const recoverCents = toCents(r.raw(row, 'recover')) ?? 0;
    let meanCents = toCents(r.raw(row, 'mean'));
    let units = toUnits(r.raw(row, 'units'));

    // Zero units is the same thing as no units: there is no position. Saying so
    // here keeps every later division by `units` safe by construction.
    if (units === 0) units = null;
    if (meanCents === 0) meanCents = null;

    // Half a position is worse than none, because it silently produces a
    // break-even price computed from a missing number.
    if ((meanCents === null) !== (units === null)) {
      const have = units === null ? 'mean' : 'units';
      const missing = units === null ? 'units' : 'mean';
      r.problem(n, missing, `${ticker} has a ${have} but no ${missing}, so no break-even price can be worked out. Its $${(recoverCents / 100).toLocaleString('en-US')} is counted as closed until both are filled in.`, 'warning');
      meanCents = null;
      units = null;
    }

    // Nothing owed and nothing held. An empty row with a ticker in it.
    if (recoverCents === 0 && units === null) continue;

    if (units !== null && units < 0) {
      r.problem(n, 'units', `${ticker} has negative units. Short positions aren't handled here. Row skipped.`);
      continue;
    }

    out.push({
      ticker,
      recoverCents,
      meanCents,
      units,
      priceCents: toCents(r.raw(row, 'price')),
      row: n,
    });
  }

  problems.push(...r.problems);
  return out;
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** "January, 2024" / "Jan 2024" / "January 2024" -> "2024-01". */
function monthLabel(value: unknown): string | null {
  const text = String(value ?? '').trim().toLowerCase();
  const m = /^([a-z]+)[,\s]+(\d{4})$/.exec(text);
  if (!m) return null;
  const i = MONTH_NAMES.findIndex((n) => n === m[1] || n.slice(0, 3) === m[1].slice(0, 3));
  if (i < 0) return null;
  return `${m[2]}-${String(i + 1).padStart(2, '0')}`;
}

function daysInMonthOf(month: string): number {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

/**
 * Reads the premiums grid: a row per month, columns 1..31 for the days.
 *
 * Rows are found by their month label rather than by position, so the year
 * blocks can be stacked with a repeated header row between them — which is how
 * the sheet is actually laid out — and the headers and footer totals fall out
 * for free by simply not looking like "January, 2024".
 */
function parsePremiums(rows: RawRows, tab: string, problems: Problem[]): PremiumMonth[] {
  if (rows.length === 0) return [];
  const r = new Reader(tab, rows[0]);
  const out: PremiumMonth[] = [];
  const seen = new Map<string, number>();

  for (const { row, n } of body(rows)) {
    const month = monthLabel(row[0]);
    if (month === null) continue; // header row, footer, or spacing

    const first = seen.get(month);
    if (first !== undefined) {
      r.problem(n, 'month', `${month} already appears on row ${first}. Only the first is used.`);
      continue;
    }

    const dim = daysInMonthOf(month);
    const days: { day: number; amountCents: number }[] = [];
    for (let day = 1; day <= 31; day++) {
      const raw = row[day];
      const text = String(raw ?? '').trim();
      // Blank and N/A are both "no entry". They differ in meaning — one is a day
      // not yet filled in, the other a day the month doesn't have — but neither
      // is a zero, and treating them as zero would drag every average down.
      if (text === '' || text.toUpperCase() === 'N/A') continue;
      const amountCents = toCents(raw);
      if (amountCents === null) {
        r.problem(n, `day ${day}`, `Couldn't read "${text}" as an amount. That day was skipped.`);
        continue;
      }
      if (day > dim) {
        // A zero sitting in a day the month doesn't have is a spreadsheet
        // artifact -- a formula filled across all 31 columns -- not a mistake
        // anyone needs to hear about. Only a real figure is worth flagging,
        // because only a real figure is missing from a total.
        if (amountCents !== 0) {
          r.problem(n, `day ${day}`, `${month} only has ${dim} days, but there's a figure in the day ${day} column. It was left out.`, 'warning');
        }
        continue;
      }
      days.push({ day, amountCents });
    }

    // A month with no cells filled in at all is a future placeholder, not a
    // month that earned nothing. Including it would put a false zero on the
    // chart and drag the monthly average toward it.
    if (days.length === 0) continue;

    const totalCents = days.reduce((a, d) => a + d.amountCents, 0);

    // Cross-check the sheet's own Total column. It isn't used for anything, but
    // a disagreement means a formula no longer covers every day cell, and that
    // is worth knowing before you trust the figure you've been reading.
    const stated = toCents(r.raw(row, 'total'));
    if (stated !== null && stated !== totalCents) {
      r.problem(n, 'total', `The Total column says ${(stated / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} but the day cells add to ${(totalCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}. The app uses the day cells; check the formula's range.`, 'warning');
    }

    seen.set(month, n);
    out.push({ month, days, totalCents, row: n });
  }

  out.sort((a, b) => a.month.localeCompare(b.month));
  problems.push(...r.problems);
  return out;
}

/**
 * M/D/YY, MM/DD/YYYY or an ISO date, to YYYY-MM-DD.
 *
 * Both two- and four-digit years appear in the same column of the real sheet,
 * so guessing one format would silently drop half the rows. A two-digit year
 * is read as 20YY, which is right for every roll anyone will ever log here.
 */
function americanDate(value: unknown): string | null {
  const iso = normaliseDate(value);
  if (iso) return iso;
  const text = String(value ?? '').trim();
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(text);
  if (!m) return null;
  const [, mm, dd, yy] = m;
  const year = yy.length === 2 ? `20${yy}` : yy;
  return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/**
 * Reads the rolls log.
 *
 * The sheet puts the percent-recovered on its own row beneath each roll, with
 * blank spacer rows between tickers. Both fall out for free by requiring a
 * ticker, the same way the premiums grid ignores its header and footer rows.
 */
function parseRolls(rows: RawRows, problems: Problem[]): Roll[] {
  if (rows.length === 0) return [];
  const r = new Reader('rolls', rows[0]);
  r.missingColumns(['ticker', 'cost'], problems);

  const out: Roll[] = [];

  for (const { row, n } of body(rows)) {
    const ticker = r.text(row, 'ticker').toUpperCase();
    if (!ticker) continue; // the percentage row, or a spacer

    const date = americanDate(r.raw(row, 'rolled at (mm/dd/yy)') ?? r.raw(row, 'rolled at'));
    if (!date) {
      r.problem(n, 'rolled at', `Couldn't read "${r.text(row, 'rolled at (mm/dd/yy)')}" as a date. Row skipped.`);
      continue;
    }

    const costCents = toCents(r.raw(row, 'cost'));
    if (costCents === null) {
      r.problem(n, 'cost', `Couldn't read "${r.text(row, 'cost')}" as an amount. Row skipped.`);
      continue;
    }

    const contractsRaw = r.raw(row, 'number of contracts');
    const contracts = Number(String(contractsRaw ?? '1').replace(/,/g, '')) || 1;
    const totalCostCents = Math.round(costCents * contracts);

    // The sheet keeps its own total. Recompute and compare: a contract count
    // edited without refreshing the total is exactly the kind of drift that
    // makes a ledger quietly wrong rather than loudly broken.
    const statedTotal = toCents(r.raw(row, 'total cost'));
    if (statedTotal !== null && statedTotal !== totalCostCents) {
      r.problem(n, 'total cost', `${ticker}: the sheet says ${(statedTotal / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} but cost x contracts is ${(totalCostCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}. The app uses cost x contracts.`, 'warning');
    }

    const recoveredCents = toCents(r.raw(row, 'recovered')) ?? 0;
    if (recoveredCents > totalCostCents) {
      r.problem(n, 'recovered', `${ticker} has recovered more than the roll cost. Anything past the cost is profit, not recovery — worth checking the figure.`, 'warning');
    }

    out.push({
      ticker,
      date,
      strikeFrom: Number(r.raw(row, 'rolled from')) || 0,
      strikeTo: Number(r.raw(row, 'rolled to')) || 0,
      costCents,
      contracts,
      totalCostCents,
      recoveredCents,
      row: n,
    });
  }

  out.sort((a, b) => b.date.localeCompare(a.date) || b.totalCostCents - a.totalCostCents);
  problems.push(...r.problems);
  return out;
}

/**
 * Event contracts: one row per month, with the month's realized total.
 *
 * The sheet also keeps a running year-to-date column. It is read only to check
 * against, never to display — a running total is exactly the kind of column
 * that keeps a stale value after a month above it is edited.
 */
function parseEvents(rows: RawRows, problems: Problem[]): EventMonth[] {
  if (rows.length === 0) return [];
  const r = new Reader('events', rows[0]);
  r.missingColumns(['month', 'total'], problems);

  const out: EventMonth[] = [];
  const seen = new Map<string, number>();

  for (const { row, n } of body(rows)) {
    const month = monthLabel(row[0]);
    if (month === null) continue;

    const first = seen.get(month);
    if (first !== undefined) {
      r.problem(n, 'month', `${month} already appears on row ${first}. Only the first is used.`);
      continue;
    }

    const totalCents = toCents(r.raw(row, 'total'));
    if (totalCents === null) {
      r.problem(n, 'total', `Couldn't read "${r.text(row, 'total')}" as an amount. Row skipped.`);
      continue;
    }

    seen.set(month, n);
    out.push({ month, totalCents, row: n });
  }

  // The sheet's own running column, checked in one pass. A disagreement means
  // the running total no longer follows from the months above it.
  const ytdColumn = 'realized profit & loss ytd';
  if (r.has(ytdColumn)) {
    let running = 0;
    let year = '';
    for (const { row, n } of body(rows)) {
      const month = monthLabel(row[0]);
      if (month === null) continue;
      const entry = out.find((e) => e.month === month);
      if (!entry || entry.row !== n) continue;
      if (month.slice(0, 4) !== year) { year = month.slice(0, 4); running = 0; }
      running += entry.totalCents;
      const stated = toCents(r.raw(row, ytdColumn));
      if (stated !== null && stated !== running) {
        r.problem(n, 'realized profit & loss ytd', `The running total says ${(stated / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} but the months above add to ${(running / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}. The app adds up the months.`, 'warning');
        break; // one message, not one per row after the first divergence
      }
    }
  }

  out.sort((a, b) => a.month.localeCompare(b.month));
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
  const positions = parsePositions(raw.positions, problems);
  const premiums = parsePremiums(raw.premiums, 'premiums', problems);
  const premiumsAnoosha = parsePremiums(raw.premiums_anoosha, 'premiums_anoosha', problems);
  const rolls = parseRolls(raw.rolls, problems);
  const events = parseEvents(raw.events, problems);
  const config = parseConfig(raw.config);

  transactions.sort((a, b) => b.date.localeCompare(a.date) || b.row - a.row);
  balances.sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row);

  problems.sort(
    (a, b) => a.tab.localeCompare(b.tab) || a.row - b.row || a.column.localeCompare(b.column),
  );

  return {
    accounts, categories, transactions, balances, budgets, positions,
    premiums, premiumsAnoosha, rolls, events, config,
    problems, ...meta,
  };
}
