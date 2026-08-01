/**
 * Everything the Net Worth page displays.
 *
 * Single rule, no exceptions: net worth comes from the `balances` tab and
 * nowhere else. Liabilities are entered positive in the sheet and negated here,
 * exactly once, at this boundary.
 */

import type { Account, AccountClass, Balance, Config } from '../types';
import { monthRange } from '../dates';
import { pctChange } from '../money';
import { rangeStart, type Range } from '../range';

export interface AccountPoint {
  accountId: string;
  name: string;
  klass: AccountClass;
  /** signed: assets positive, liabilities negative */
  signedCents: number;
  /** as entered in the sheet, always positive */
  rawCents: number;
  /** true when this month had no row and we carried the previous one forward */
  carried: boolean;
}

export interface NetWorthPoint {
  month: string;
  cashCents: number;
  investmentCents: number;
  /** cash + investment */
  assetsCents: number;
  /** negative number */
  liabilitiesCents: number;
  netCents: number;
  accounts: AccountPoint[];
  /** accounts that had no row this month and were carried forward */
  carriedAccountIds: string[];
}

/**
 * Carry-forward is the one judgement call in this file.
 *
 * If you record a mortgage balance in January and then forget it in February,
 * the honest options are to drop it (net worth leaps upward — alarming and
 * wrong) or to carry January's figure forward (slightly stale, directionally
 * right). We carry forward, and every carried account is named in the return
 * value so the page can say so out loud rather than quietly smoothing over it.
 *
 * We never carry forward *before* an account's first real row — an account you
 * opened in March did not exist in January.
 *
 * This always covers every month you have data for. Narrowing the range on the
 * page trims what the CHART draws, never what gets computed — see
 * `visibleSeries`. Getting that backwards silently blanked every year-on-year
 * comparison the one time this function honoured a start month itself.
 */
export function netWorthSeries(
  accounts: Account[],
  balances: Balance[],
): NetWorthPoint[] {
  if (balances.length === 0) return [];

  const byAccount = new Map<string, Account>();
  for (const a of accounts) byAccount.set(a.accountId, a);

  // month -> accountId -> cents. Later rows for the same pair win, so a
  // corrected entry pasted below an old one does the expected thing.
  const grid = new Map<string, Map<string, number>>();
  for (const b of balances) {
    if (!grid.has(b.month)) grid.set(b.month, new Map());
    grid.get(b.month)!.set(b.accountId, b.balanceCents);
  }

  const allMonths = [...grid.keys()].sort();
  const first = allMonths[0];
  const last = allMonths[allMonths.length - 1];

  const firstSeen = new Map<string, string>();
  for (const b of balances) {
    const prev = firstSeen.get(b.accountId);
    if (!prev || b.month < prev) firstSeen.set(b.accountId, b.month);
  }

  const out: NetWorthPoint[] = [];
  const carry = new Map<string, number>();

  for (const month of monthRange(first, last)) {
    const thisMonth = grid.get(month);
    const points: AccountPoint[] = [];
    const carried: string[] = [];

    // Union of every account we've ever seen a balance for, in sheet order
    // where possible so the table is stable between months.
    const ids = new Set<string>([...carry.keys(), ...(thisMonth?.keys() ?? [])]);

    for (const accountId of ids) {
      const started = firstSeen.get(accountId);
      if (!started || month < started) continue;

      let rawCents: number;
      let wasCarried = false;
      if (thisMonth?.has(accountId)) {
        rawCents = thisMonth.get(accountId)!;
        carry.set(accountId, rawCents);
      } else {
        const prev = carry.get(accountId);
        if (prev === undefined) continue;
        rawCents = prev;
        wasCarried = true;
        carried.push(accountId);
      }

      const account = byAccount.get(accountId);
      // An account that isn't on the accounts tab is reported as a problem
      // elsewhere; here we have to pick something, and cash is the reading that
      // doesn't silently invert the sign.
      const klass = account?.klass ?? 'cash';
      points.push({
        accountId,
        name: account?.name ?? accountId,
        klass,
        rawCents,
        signedCents: klass === 'liability' ? -rawCents : rawCents,
        carried: wasCarried,
      });
    }

    const sumOf = (k: AccountClass) =>
      points.filter((p) => p.klass === k).reduce((a, p) => a + p.signedCents, 0);

    const cashCents = sumOf('cash');
    const investmentCents = sumOf('investment');
    const assetsCents = cashCents + investmentCents;
    const liabilitiesCents = sumOf('liability');

    points.sort((a, b) => b.signedCents - a.signedCents);

    out.push({
      month,
      cashCents,
      investmentCents,
      assetsCents,
      liabilitiesCents,
      netCents: assetsCents + liabilitiesCents,
      accounts: points,
      carriedAccountIds: carried,
    });
  }

  return out;
}

export interface NetWorthSummary {
  current: NetWorthPoint | null;
  previous: NetWorthPoint | null;
  yearAgo: NetWorthPoint | null;
  changeCents: number | null;
  changeYearCents: number | null;
  goalCents: number | null;
  goalRatio: number | null;
  /** cash as a share of total assets — how liquid you actually are */
  cashShare: number | null;
}

export function netWorthSummary(
  series: NetWorthPoint[],
  config: Config,
): NetWorthSummary {
  const current = series.length ? series[series.length - 1] : null;
  const previous = series.length > 1 ? series[series.length - 2] : null;
  const yearAgo = series.length > 12 ? series[series.length - 13] : null;

  const goal = config.netWorthGoalCents;

  return {
    current,
    previous,
    yearAgo,
    changeCents: current && previous ? current.netCents - previous.netCents : null,
    changeYearCents: current && yearAgo ? current.netCents - yearAgo.netCents : null,
    goalCents: goal,
    goalRatio: goal && goal > 0 && current ? current.netCents / goal : null,
    cashShare:
      current && current.assetsCents > 0 ? current.cashCents / current.assetsCents : null,
  };
}

/** How far back each change column looks, in months. */
export const LOOKBACKS = [1, 3, 6, 12] as const;

export interface Change {
  cents: number | null;
  /** null when the base was too small for a percentage to mean anything */
  pct: number | null;
}

export interface AccountRow {
  accountId: string;
  name: string;
  klass: AccountClass;
  currentCents: number;
  /** lookback in months -> the change over that span */
  changes: Record<number, Change>;
  shareOfAssets: number | null;
  carried: boolean;
}

/**
 * Below this starting balance, a percentage change is noise rather than news.
 *
 * A card that went from owing $8 to owing $1,746 has technically changed by
 * -21,925%, which tells you nothing that "-$1,738" doesn't tell you better. The
 * dollar figure is always shown; the percentage only appears when there was
 * enough there to be a share of.
 */
const PCT_FLOOR_CENTS = 10_000; // $100

function changeFrom(before: number | undefined, now: number): Change {
  if (before === undefined) return { cents: null, pct: null };
  return {
    cents: now - before,
    // pctChange divides by the magnitude of the base, so a debt shrinking from
    // -1,000 to -800 reads as +20% — an improvement, not a fall.
    pct: Math.abs(before) < PCT_FLOOR_CENTS ? null : pctChange(before, now),
  };
}

export function accountTable(series: NetWorthPoint[]): AccountRow[] {
  if (series.length === 0) return [];
  const current = series[series.length - 1];

  // For each lookback, the balances as they stood that many months earlier.
  // A lookback reaching past the start of the data yields no column entry
  // rather than a comparison against a month that doesn't exist.
  const past = new Map<number, Map<string, number>>();
  for (const back of LOOKBACKS) {
    const point = series[series.length - 1 - back];
    past.set(back, new Map(point?.accounts.map((a) => [a.accountId, a.signedCents]) ?? []));
  }

  const rows: AccountRow[] = current.accounts.map((p) => {
    const changes: Record<number, Change> = {};
    for (const back of LOOKBACKS) {
      changes[back] = changeFrom(past.get(back)!.get(p.accountId), p.signedCents);
    }
    return {
      accountId: p.accountId,
      name: p.name,
      klass: p.klass,
      currentCents: p.signedCents,
      changes,
      shareOfAssets:
        p.klass !== 'liability' && current.assetsCents > 0
          ? p.signedCents / current.assetsCents
          : null,
      carried: p.carried,
    };
  });

  const order: Record<AccountClass, number> = { cash: 0, investment: 1, liability: 2 };
  rows.sort((a, b) => {
    if (a.klass !== b.klass) return order[a.klass] - order[b.klass];
    return Math.abs(b.currentCents) - Math.abs(a.currentCents);
  });
  return rows;
}

/**
 * The slice of the series to draw. Display only — every figure on the page is
 * computed from the full series regardless of what this returns, which is the
 * whole point: changing the range must never change a number.
 */
export function visibleSeries(series: NetWorthPoint[], range: Range): NetWorthPoint[] {
  if (series.length === 0) return series;
  const start = rangeStart(range, series[series.length - 1].month, series[0].month);
  const trimmed = series.filter((p) => p.month >= start);
  return trimmed.length > 0 ? trimmed : series;
}

/**
 * Months where at least one account that existed then had no balance row.
 * Surfaced on the page so a flat stretch reads as "you didn't record this"
 * rather than "your finances didn't move".
 */
export function gapMonths(series: NetWorthPoint[]): { month: string; accountIds: string[] }[] {
  return series
    .filter((p) => p.carriedAccountIds.length > 0)
    .map((p) => ({ month: p.month, accountIds: p.carriedAccountIds }));
}
