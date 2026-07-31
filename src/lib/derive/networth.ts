/**
 * Everything the Net Worth page displays.
 *
 * Single rule, no exceptions: net worth comes from the `balances` tab and
 * nowhere else. Liabilities are entered positive in the sheet and negated here,
 * exactly once, at this boundary.
 */

import type { Account, Balance, Config } from '../types';
import { monthRange } from '../dates';

export interface AccountPoint {
  accountId: string;
  name: string;
  klass: 'asset' | 'liability';
  active: boolean;
  /** signed: assets positive, liabilities negative */
  signedCents: number;
  /** as entered in the sheet, always positive */
  rawCents: number;
  /** true when this month had no row and we carried the previous one forward */
  carried: boolean;
}

export interface NetWorthPoint {
  month: string;
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
 */
export function netWorthSeries(
  accounts: Account[],
  balances: Balance[],
  opts: { startMonth?: string | null } = {},
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
  let first = allMonths[0];
  const last = allMonths[allMonths.length - 1];
  if (opts.startMonth && opts.startMonth > first) first = opts.startMonth;

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
      const klass = account?.klass ?? 'asset';
      points.push({
        accountId,
        name: account?.name ?? accountId,
        klass,
        active: account?.active ?? true,
        rawCents,
        signedCents: klass === 'liability' ? -rawCents : rawCents,
        carried: wasCarried,
      });
    }

    const assetsCents = points
      .filter((p) => p.klass === 'asset')
      .reduce((a, p) => a + p.signedCents, 0);
    const liabilitiesCents = points
      .filter((p) => p.klass === 'liability')
      .reduce((a, p) => a + p.signedCents, 0);

    points.sort((a, b) => b.signedCents - a.signedCents);

    out.push({
      month,
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
  };
}

export interface AccountRow {
  accountId: string;
  name: string;
  klass: 'asset' | 'liability';
  active: boolean;
  currentCents: number;
  changeMonthCents: number | null;
  changeYearCents: number | null;
  shareOfAssets: number | null;
  carried: boolean;
}

export function accountTable(series: NetWorthPoint[]): AccountRow[] {
  if (series.length === 0) return [];
  const current = series[series.length - 1];
  const previous = series.length > 1 ? series[series.length - 2] : null;
  const yearAgo = series.length > 12 ? series[series.length - 13] : null;

  const prevBy = new Map(previous?.accounts.map((a) => [a.accountId, a.signedCents]) ?? []);
  const yearBy = new Map(yearAgo?.accounts.map((a) => [a.accountId, a.signedCents]) ?? []);

  const rows: AccountRow[] = current.accounts.map((p) => {
    const prev = prevBy.get(p.accountId);
    const year = yearBy.get(p.accountId);
    return {
      accountId: p.accountId,
      name: p.name,
      klass: p.klass,
      active: p.active,
      currentCents: p.signedCents,
      changeMonthCents: prev === undefined ? null : p.signedCents - prev,
      changeYearCents: year === undefined ? null : p.signedCents - year,
      shareOfAssets:
        p.klass === 'asset' && current.assetsCents > 0
          ? p.signedCents / current.assetsCents
          : null,
      carried: p.carried,
    };
  });

  rows.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.klass !== b.klass) return a.klass === 'asset' ? -1 : 1;
    return Math.abs(b.currentCents) - Math.abs(a.currentCents);
  });
  return rows;
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
