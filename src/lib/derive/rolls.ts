/**
 * Options rolls, and how much of each has been earned back.
 *
 * Each roll is its own small ledger: a debit paid to move a short call up to a
 * higher strike, and the premium since collected against that cost. An amount
 * paid, an amount recovered so far, and a remainder.
 *
 * Accounting is per roll, never pooled. Two rolls on the same ticker months
 * apart are separate obligations with separate strikes, and a good recovery on
 * one says nothing about the other. Summing them into a per-ticker figure would
 * hide exactly the comparison worth making.
 */

import type { Roll } from '../types';

export interface RollRow extends Roll {
  /** recovered / cost, 0..1+. Null when a roll somehow cost nothing. */
  pctRecovered: number | null;
  remainingCents: number;
  /** Strike distance bought by the roll, in points. Null on a buy-to-close. */
  strikeMoved: number | null;
}

export interface RollSummary {
  totalCostCents: number;
  recoveredCents: number;
  remainingCents: number;
  /** Fraction of everything paid that has come back. 0..1. */
  progress: number;
  rollCount: number;
  contracts: number;
  tickers: number;
  /** Rolls that have earned back everything they cost. */
  clearedCount: number;
}

export interface RollEvent {
  date: string;
  totalCostCents: number;
  recoveredCents: number;
  remainingCents: number;
  rollCount: number;
  tickers: string[];
}

export function rollRows(rolls: Roll[]): RollRow[] {
  return rolls.map((r) => ({
    ...r,
    pctRecovered: r.totalCostCents > 0 ? r.recoveredCents / r.totalCostCents : null,
    remainingCents: r.totalCostCents - r.recoveredCents,
    strikeMoved: r.strikeFrom !== null && r.strikeTo !== null
      ? r.strikeTo - r.strikeFrom
      : null,
  }));
}

export function rollSummary(rows: RollRow[]): RollSummary {
  const totalCostCents = rows.reduce((a, r) => a + r.totalCostCents, 0);
  const recoveredCents = rows.reduce((a, r) => a + r.recoveredCents, 0);
  return {
    totalCostCents,
    recoveredCents,
    remainingCents: totalCostCents - recoveredCents,
    progress: totalCostCents > 0 ? recoveredCents / totalCostCents : 0,
    rollCount: rows.length,
    contracts: rows.reduce((a, r) => a + r.contracts, 0),
    tickers: new Set(rows.map((r) => r.ticker)).size,
    clearedCount: rows.filter((r) => r.remainingCents <= 0).length,
  };
}

/**
 * Rolls grouped by the day they were done.
 *
 * Rolling tends to happen in bursts — one decision across a whole book on a
 * single day, not one position at a time. Grouping by date makes that visible
 * as an event with a size, which a flat list of eleven rows does not.
 */
export function rollEvents(rows: RollRow[]): RollEvent[] {
  const byDate = new Map<string, RollRow[]>();
  for (const r of rows) {
    const list = byDate.get(r.date) ?? [];
    list.push(r);
    byDate.set(r.date, list);
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => {
      const totalCostCents = list.reduce((a, r) => a + r.totalCostCents, 0);
      const recoveredCents = list.reduce((a, r) => a + r.recoveredCents, 0);
      return {
        date,
        totalCostCents,
        recoveredCents,
        remainingCents: totalCostCents - recoveredCents,
        rollCount: list.length,
        tickers: [...new Set(list.map((r) => r.ticker))],
      };
    });
}

export type RollSort = 'remaining' | 'cost' | 'progress' | 'date' | 'ticker';

/** Display-only. Sorting never changes a figure. */
export function sortRolls(rows: RollRow[], key: RollSort): RollRow[] {
  const out = [...rows];
  switch (key) {
    case 'cost':
      return out.sort((a, b) => b.totalCostCents - a.totalCostCents);
    case 'progress':
      // Best-recovered first; a roll with no percentage sinks rather than
      // sorting as if it were zero.
      return out.sort((a, b) => {
        if (a.pctRecovered === null) return 1;
        if (b.pctRecovered === null) return -1;
        return b.pctRecovered - a.pctRecovered;
      });
    case 'ticker':
      return out.sort((a, b) => a.ticker.localeCompare(b.ticker) || a.date.localeCompare(b.date));
    case 'date':
      return out.sort((a, b) => b.date.localeCompare(a.date) || b.totalCostCents - a.totalCostCents);
    case 'remaining':
    default:
      return out.sort((a, b) => b.remainingCents - a.remainingCents);
  }
}
