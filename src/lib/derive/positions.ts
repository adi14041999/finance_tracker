/**
 * The recovery ledger.
 *
 * The model, stated once so the rest of the file reads clearly:
 *
 *   `recover` is a REALIZED loss on a ticker — money that is gone. It changes
 *   only when the sheet is edited. Nothing computed here can move it.
 *
 *   A position held today (mean, units) is the vehicle for earning that back.
 *   Its gain is UNREALIZED: real on paper, not banked, and it evaporates if the
 *   price falls tomorrow.
 *
 * Break-even is therefore not the mean price. The position has to climb far
 * enough above its own cost to cover a debt incurred somewhere else in the past:
 *
 *   break-even price = mean + recover / units
 *
 * Accounting is strictly PER NAME. A gain on SPY does not pay off the loss on
 * META. That was a deliberate choice, and it has a consequence the summary is
 * careful to keep visible: the tickers with a recover figure and no position
 * have no break-even price at all, because there is nothing to sell. Their loss
 * cannot come back until those names are re-entered. Pooling would hide that;
 * keeping them separate makes the dead weight impossible to miss.
 */

import type { Position } from '../types';

/** A ticker still held, with everything the page needs worked out. */
export interface HeldName {
  ticker: string;
  recoverCents: number;
  meanCents: number;
  units: number;
  priceCents: number | null;

  costBasisCents: number;
  /** mean + recover / units — the price that clears the realized loss. */
  breakEvenCents: number;
  /** break-even as a multiple of mean. 2.17x is a very different ask from 1.03x. */
  breakEvenMultiple: number;

  // Everything below needs a live price, and is null without one.
  marketValueCents: number | null;
  /** (price - mean) * units. Unrealized: on paper until sold. */
  unrealisedCents: number | null;
  /** How far the price must rise from here, as a fraction. Negative = cleared. */
  gapPct: number | null;
  /** Of this name's recover, what closing today would cover. Never exceeds it. */
  recoveredCents: number | null;
  /** recover - recovered. Full recover when there's no price to judge by. */
  remainingCents: number;
  /** Gain beyond what this name owed. Real profit, not recovery. */
  surplusCents: number | null;
  cleared: boolean;
}

/** A ticker with a realized loss and no position behind it. */
export interface ClosedName {
  ticker: string;
  recoverCents: number;
}

export interface RecoverySummary {
  totalRecoverCents: number;
  heldRecoverCents: number;
  closedRecoverCents: number;

  costBasisCents: number;
  marketValueCents: number | null;
  unrealisedCents: number | null;

  /** What closing every priced position today would clear, per name. */
  recoveredCents: number;
  remainingCents: number;
  /** Fraction of the total ledger cleared. 0..1. */
  progress: number;
  surplusCents: number;

  heldCount: number;
  closedCount: number;
  clearedCount: number;
  /** Held names whose price didn't come through — counted as nothing recovered. */
  unpriced: string[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function heldNames(positions: Position[]): HeldName[] {
  const out: HeldName[] = [];

  for (const p of positions) {
    if (p.meanCents === null || p.units === null || p.units === 0) continue;

    const { meanCents, units, recoverCents, priceCents } = p;
    const costBasisCents = Math.round(meanCents * units);
    const breakEvenCents = meanCents + Math.round(recoverCents / units);

    let marketValueCents: number | null = null;
    let unrealisedCents: number | null = null;
    let gapPct: number | null = null;
    let recoveredCents: number | null = null;
    let surplusCents: number | null = null;
    let remainingCents = recoverCents;

    if (priceCents !== null) {
      marketValueCents = Math.round(priceCents * units);
      unrealisedCents = marketValueCents - costBasisCents;
      // Measured against the current price, because that's the move being asked
      // for. Against the mean it would understate how far there is to go on any
      // name that has fallen since purchase — which is most of them.
      gapPct = priceCents > 0 ? (breakEvenCents - priceCents) / priceCents : null;
      // A loss recovers nothing (floor at 0), and a name cannot recover more
      // than it owed (ceiling at recover) — the excess is profit, counted below.
      recoveredCents = clamp(unrealisedCents, 0, Math.max(0, recoverCents));
      surplusCents = Math.max(0, unrealisedCents - Math.max(0, recoverCents));
      remainingCents = recoverCents - recoveredCents;
    }

    out.push({
      ticker: p.ticker,
      recoverCents,
      meanCents,
      units,
      priceCents,
      costBasisCents,
      breakEvenCents,
      breakEvenMultiple: meanCents > 0 ? breakEvenCents / meanCents : 1,
      marketValueCents,
      unrealisedCents,
      gapPct,
      recoveredCents,
      remainingCents,
      surplusCents,
      cleared: priceCents !== null && priceCents >= breakEvenCents,
    });
  }

  return out;
}

export function closedNames(positions: Position[]): ClosedName[] {
  return positions
    .filter((p) => (p.meanCents === null || p.units === null) && p.recoverCents !== 0)
    .map((p) => ({ ticker: p.ticker, recoverCents: p.recoverCents }));
}

export function recoverySummary(held: HeldName[], closed: ClosedName[]): RecoverySummary {
  const heldRecoverCents = held.reduce((a, h) => a + h.recoverCents, 0);
  const closedRecoverCents = closed.reduce((a, c) => a + c.recoverCents, 0);
  const totalRecoverCents = heldRecoverCents + closedRecoverCents;

  const priced = held.filter((h) => h.priceCents !== null);
  const unpriced = held.filter((h) => h.priceCents === null).map((h) => h.ticker);

  // A closed name's loss is outstanding in full and always will be until it's
  // re-entered, so it belongs in `remaining` — not quietly dropped because it
  // has no position to measure.
  const remainingCents =
    held.reduce((a, h) => a + h.remainingCents, 0) + closedRecoverCents;
  const recoveredCents = totalRecoverCents - remainingCents;

  return {
    totalRecoverCents,
    heldRecoverCents,
    closedRecoverCents,
    costBasisCents: held.reduce((a, h) => a + h.costBasisCents, 0),
    marketValueCents: priced.length
      ? priced.reduce((a, h) => a + (h.marketValueCents ?? 0), 0)
      : null,
    unrealisedCents: priced.length
      ? priced.reduce((a, h) => a + (h.unrealisedCents ?? 0), 0)
      : null,
    recoveredCents,
    remainingCents,
    progress: totalRecoverCents > 0 ? recoveredCents / totalRecoverCents : 0,
    surplusCents: priced.reduce((a, h) => a + (h.surplusCents ?? 0), 0),
    heldCount: held.length,
    closedCount: closed.length,
    clearedCount: held.filter((h) => h.cleared).length,
    unpriced,
  };
}

export type SortKey = 'recover' | 'gap' | 'ticker' | 'value';

/**
 * Sorting is display-only and never changes a figure. Names without a price
 * sink to the bottom of a gap sort rather than being treated as zero, since
 * "no data" is not the same as "already there".
 */
export function sortHeld(held: HeldName[], key: SortKey): HeldName[] {
  const rows = [...held];
  switch (key) {
    case 'ticker':
      return rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
    case 'value':
      return rows.sort(
        (a, b) => (b.marketValueCents ?? -1) - (a.marketValueCents ?? -1),
      );
    case 'gap':
      return rows.sort((a, b) => {
        if (a.gapPct === null && b.gapPct === null) return a.ticker.localeCompare(b.ticker);
        if (a.gapPct === null) return 1;
        if (b.gapPct === null) return -1;
        return a.gapPct - b.gapPct;
      });
    case 'recover':
    default:
      return rows.sort((a, b) => b.recoverCents - a.recoverCents);
  }
}
