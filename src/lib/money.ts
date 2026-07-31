/**
 * Money handling.
 *
 * Everything internal is an integer number of cents. The reason is that binary
 * floating point cannot represent most decimal fractions exactly, so adding up
 * a few hundred transactions as floats drifts:
 *
 *   0.1 + 0.2                 === 0.30000000000000004
 *   86.42 + 312.00 + 418.60   === 817.0200000000001
 *
 * Those pennies show up as totals that don't match the sheet, which is exactly
 * the kind of bug that destroys trust in a finance app. Integers can't drift.
 * We convert at the two boundaries only: parsing in, formatting out.
 */

/** Sheet value (dollars, possibly float or string) -> integer cents. */
export function toCents(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;

  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else {
    // Tolerate "$1,204.88", "(45.00)" for negatives, stray whitespace.
    const cleaned = String(value)
      .trim()
      .replace(/[$,\s]/g, '')
      .replace(/^\((.*)\)$/, '-$1');
    if (cleaned === '') return null;
    n = Number(cleaned);
  }

  if (!Number.isFinite(n)) return null;
  return dollarsToCents(n);
}

/**
 * Dollars -> cents, without ever multiplying by 100.
 *
 * The obvious `Math.round(n * 100)` is wrong at the half cent. 8.075 is stored
 * as 8.07499999999999928..., so multiplying gives 807.4999999999999 and
 * rounding gives 807 — a cent lost, for a value the user typed as an exact
 * half. `toFixed(4)` renders the decimal the user meant ("8.0750") because it
 * rounds the double to fewer digits than its representation error, so we can
 * read the cents off the string and round the remainder ourselves, half up.
 */
function dollarsToCents(n: number): number {
  const s = n.toFixed(4); // e.g. "-8.0750"
  const negative = s.startsWith('-');
  const [whole, frac] = (negative ? s.slice(1) : s).split('.');

  const cents = Number(whole) * 100 + Number(frac.slice(0, 2));
  const remainder = Number(frac.slice(2, 4)); // hundredths of a cent, 0..99
  const total = cents + (remainder >= 50 ? 1 : 0);

  return negative ? -total : total;
}

/** Integer cents -> "$1,204.88". Negative renders as -$1,204.88. */
export function formatMoney(cents: number, opts: { cents?: boolean } = {}): string {
  const showCents = opts.cents ?? true;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = abs / 100;
  const body = dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
  return negative ? `-${body}` : body;
}

/** Compact form for chart axes and tiles: $1.2k, $340, $1.4M. */
export function formatMoneyCompact(cents: number): string {
  const negative = cents < 0;
  const dollars = Math.abs(cents) / 100;
  let body: string;
  if (dollars >= 1_000_000) body = `$${trim(dollars / 1_000_000)}M`;
  else if (dollars >= 1_000) body = `$${trim(dollars / 1_000)}k`;
  else body = `$${Math.round(dollars)}`;
  return negative ? `-${body}` : body;
}

function trim(n: number): string {
  const r = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return String(r);
}

export function formatPercent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/**
 * Percentage change from a to b, as a fraction. Returns null when the base is
 * zero, because "infinite % growth" is not a useful thing to render.
 */
export function pctChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return (to - from) / Math.abs(from);
}

export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
