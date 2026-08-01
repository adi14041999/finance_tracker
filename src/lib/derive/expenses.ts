/**
 * Everything the Expenses page displays.
 *
 * Pure functions: data in, numbers out. No React, no fetching, no clock, no
 * randomness. That is what makes them testable, and the tests are the only
 * reason to trust the numbers on screen.
 *
 * House rules encoded here:
 *   - amountCents is positive for money spent, negative for a refund.
 *   - a budget comes from the sheet or it doesn't exist. No averages, no
 *     inferred targets — a budget is a decision you made, not one the app
 *     made for you from your own past behaviour.
 */

import type { Transaction, Category, Budget, Config } from '../types';
import { addMonths, monthProgress, daysInMonth } from '../dates';

export interface CategorySpend {
  category: string;
  spentCents: number;
  /** straight from the budgets tab, or null if you haven't set one */
  budgetCents: number | null;
  /** spent / budget, or null when there is no budget to compare against */
  ratio: number | null;
  status: 'under' | 'near' | 'over' | 'none';
}

export interface MonthSummary {
  month: string;
  totalCents: number;
  budgetedTotalCents: number;
  targetCents: number | null;
  /** fraction of the monthly target consumed, null if no target set */
  targetRatio: number | null;
  /** fraction of the month elapsed, for pace comparison */
  elapsed: number;
  /** average spend per day elapsed so far — comparable across months of
   *  different lengths, and across a part-finished month */
  dailyAverageCents: number;
  transactionCount: number;
  categories: CategorySpend[];
}

/** Rows that count toward totals for a given month. */
export function spendingRows(transactions: Transaction[], month: string): Transaction[] {
  return transactions.filter((t) => t.month === month);
}

function statusFor(ratio: number | null): CategorySpend['status'] {
  if (ratio === null) return 'none';
  if (ratio > 1) return 'over';
  if (ratio >= 0.85) return 'near';
  return 'under';
}

/**
 * Per-category spend for one month, sorted worst-first: over budget before
 * near before under, and within each band by how much money is involved.
 * Sorting alphabetically would bury the thing you need to see.
 */
export function categorySpend(
  transactions: Transaction[],
  categories: Category[],
  budgets: Budget[],
  month: string,
): CategorySpend[] {
  const rows = spendingRows(transactions, month);

  const spentBy = new Map<string, number>();
  for (const t of rows) {
    spentBy.set(t.category, (spentBy.get(t.category) ?? 0) + t.amountCents);
  }

  const budgetBy = new Map<string, number>();
  for (const b of budgets) {
    if (b.month === month) budgetBy.set(b.category, b.amountCents);
  }

  const out: CategorySpend[] = categories.map((c) => {
    const spentCents = spentBy.get(c.category) ?? 0;
    const budgetCents = budgetBy.get(c.category) ?? null;
    const ratio =
      budgetCents !== null && budgetCents > 0 ? spentCents / budgetCents : null;

    return {
      category: c.category,
      spentCents,
      budgetCents,
      ratio,
      status: statusFor(ratio),
    };
  });

  // Drop categories with no activity and no budget — they'd be dead rows.
  const live = out.filter((c) => c.spentCents !== 0 || c.budgetCents !== null);

  const rank = { over: 0, near: 1, under: 2, none: 3 } as const;
  live.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.status === 'over' || a.status === 'near') {
      // Biggest overshoot in dollars first.
      const aOver = a.spentCents - (a.budgetCents ?? 0);
      const bOver = b.spentCents - (b.budgetCents ?? 0);
      if (aOver !== bOver) return bOver - aOver;
    }
    if (a.spentCents !== b.spentCents) return b.spentCents - a.spentCents;
    return a.category.localeCompare(b.category);
  });

  return live;
}

export function monthSummary(
  transactions: Transaction[],
  categories: Category[],
  budgets: Budget[],
  config: Config,
  month: string,
  today: string,
): MonthSummary {
  const rows = spendingRows(transactions, month);
  const cats = categorySpend(transactions, categories, budgets, month);

  const totalCents = rows.reduce((a, t) => a + t.amountCents, 0);
  const budgetedTotalCents = cats.reduce((a, c) => a + (c.budgetCents ?? 0), 0);

  const target = config.monthlySpendTargetCents;

  const elapsed = monthProgress(month, today);
  const days = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  // Guard the divisor: on the 1st of a month, elapsed * days rounds toward 0.
  const daysElapsed = Math.max(1, Math.round(elapsed * days));

  return {
    month,
    totalCents,
    budgetedTotalCents,
    targetCents: target,
    targetRatio: target && target > 0 ? totalCents / target : null,
    elapsed,
    dailyAverageCents: Math.round(totalCents / daysElapsed),
    transactionCount: rows.length,
    categories: cats,
  };
}

/** The smoothing windows the Expenses page offers, in months. */
export const TREND_WINDOWS = [3, 6, 12] as const;

export interface TrendPoint {
  month: string;
  totalCents: number;
  /** window size in months -> the average, or null if history is too short */
  rolling: Record<number, number | null>;
}

/**
 * Monthly totals across a span, plus a running average for each requested
 * window so one expensive month doesn't read as a trend.
 *
 * Two rules worth stating:
 *
 * Averages are computed from the real data, not from the visible months. Change
 * the chart's range and the numbers must not move — narrowing a view is not a
 * change to what happened.
 *
 * A window that reaches back before the sheet begins returns null rather than
 * treating those months as zero. Months that never existed aren't months in
 * which you spent nothing, and averaging them in would invent a downward trend
 * at the very start of every series.
 *
 * Pass a category to narrow to that one; omit it for everything.
 */
export function spendTrend(
  transactions: Transaction[],
  months: string[],
  category?: string | null,
  windows: readonly number[] = TREND_WINDOWS,
): TrendPoint[] {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (category && t.category !== category) continue;
    totals.set(t.month, (totals.get(t.month) ?? 0) + t.amountCents);
  }

  const earliest = [...totals.keys()].sort()[0];

  return months.map((month) => {
    const rolling: Record<number, number | null> = {};

    for (const w of windows) {
      const first = addMonths(month, -(w - 1));
      if (earliest === undefined || first < earliest) {
        rolling[w] = null;
        continue;
      }
      let sum = 0;
      for (let i = 0; i < w; i++) sum += totals.get(addMonths(month, -i)) ?? 0;
      rolling[w] = Math.round(sum / w);
    }

    return { month, totalCents: totals.get(month) ?? 0, rolling };
  });
}

/** Biggest categories this month, for the summary strip. */
export function topCategories(summary: MonthSummary, n = 5): CategorySpend[] {
  return [...summary.categories]
    .filter((c) => c.spentCents > 0)
    .sort((a, b) => b.spentCents - a.spentCents)
    .slice(0, n);
}
