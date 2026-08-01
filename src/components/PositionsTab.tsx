'use client';

import { useMemo, useState } from 'react';
import type { Position } from '@/lib/types';
import {
  heldNames, closedNames, recoverySummary, sortHeld, type SortKey,
} from '@/lib/derive/positions';
import { formatMoney, formatPercent } from '@/lib/money';
import StatTile from './StatTile';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recover', label: 'Most owed' },
  { key: 'gap', label: 'Closest to break-even' },
  { key: 'value', label: 'Largest position' },
  { key: 'ticker', label: 'Ticker' },
];

/** Share prices need their cents; the ledger totals don't. */
function price(cents: number): string {
  return formatMoney(cents, { cents: true });
}

function units(n: number): string {
  // 500.86 and 4000 should both read naturally, so trim rather than pad.
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/**
 * How far the price has to climb, which is the only number here that answers
 * "is this plausible". Colour is never the whole message — the figure itself
 * says the same thing, so this reads identically in greyscale.
 */
function Gap({ pct, cleared }: { pct: number | null; cleared: boolean }) {
  if (pct === null) {
    return <span className="text-ink-muted">no price</span>;
  }
  if (cleared) {
    return <span className="text-delta-good">cleared</span>;
  }
  const tone = pct > 1 ? 'text-ink-muted' : pct > 0.25 ? 'text-ink-secondary' : 'text-ink';
  return <span className={tone}>+{formatPercent(pct, 0)}</span>;
}

export default function PositionsTab({ positions }: { positions: Position[] }) {
  const [sort, setSort] = useState<SortKey>('recover');

  const held = useMemo(() => heldNames(positions), [positions]);
  const closed = useMemo(() => closedNames(positions), [positions]);
  const summary = useMemo(() => recoverySummary(held, closed), [held, closed]);
  const rows = useMemo(() => sortHeld(held, sort), [held, sort]);

  // What share of the outstanding ledger sits on names that need to more than
  // double. Worth stating plainly: it's the difference between a target and
  // a wish, and it isn't visible from the total alone.
  const stretch = useMemo(() => {
    const far = held.filter((h) => h.breakEvenMultiple > 2);
    return { count: far.length, cents: far.reduce((a, h) => a + h.remainingCents, 0) };
  }, [held]);

  if (positions.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-ink-secondary">
          Nothing on the <code className="rounded bg-sunken px-1">positions</code> tab yet.
          Add a row per ticker with <strong>recover</strong>, <strong>mean</strong> and{' '}
          <strong>units</strong>, and this page will fill in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="card p-6">
        <div className="text-sm text-ink-secondary">Still to recover</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-4">
          <span className="text-5xl font-semibold tracking-tight">
            {formatMoney(summary.remainingCents, { cents: false })}
          </span>
          <span className="text-sm text-ink-muted">
            of {formatMoney(summary.totalRecoverCents, { cents: false })} realized losses
            across {summary.heldCount + summary.closedCount} tickers
          </span>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between text-xs text-ink-muted">
            <span>
              {formatMoney(summary.recoveredCents, { cents: false })} covered if you closed
              every position today
            </span>
            <span className="tabular">{formatPercent(summary.progress, 1)}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-series-1"
              style={{ width: `${Math.min(1, Math.max(0, summary.progress)) * 100}%` }}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Cost basis"
          valueCents={summary.costBasisCents}
          hint={`What you paid for the ${summary.heldCount} positions you hold.`}
        />
        <StatTile
          label="Market value"
          valueCents={summary.marketValueCents ?? 0}
          hint={
            summary.marketValueCents === null
              ? 'No live prices yet.'
              : 'What those positions are worth right now.'
          }
        />
        <StatTile
          label="Unrealized"
          valueCents={summary.unrealisedCents ?? 0}
          hint="Paper gain or loss on today's holdings, before any recovery."
        />
      </div>

      {summary.unpriced.length > 0 && (
        <section className="card border-warning/40 p-5">
          <h2 className="text-base font-semibold">No price for {summary.unpriced.length} names</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            {summary.unpriced.join(', ')} — the <code className="rounded bg-sunken px-1">price</code>{' '}
            column is empty, usually a <code className="rounded bg-sunken px-1">GOOGLEFINANCE</code>{' '}
            formula that hasn&apos;t resolved or a ticker it doesn&apos;t recognise. Their losses
            are counted as fully outstanding rather than guessed at, so the headline above is
            conservative, not wrong.
          </p>
        </section>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Positions you hold</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Break-even is the mean plus what the name owes, spread over the units you
              hold — the price at which this position has earned back its own history.
            </p>
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm"
            aria-label="Sort positions"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                <th className="py-2 pr-3 font-medium">Ticker</th>
                <th className="py-2 pr-3 text-right font-medium">To recover</th>
                <th className="py-2 pr-3 text-right font-medium">Mean</th>
                <th className="py-2 pr-3 text-right font-medium">Units</th>
                <th className="py-2 pr-3 text-right font-medium">Price</th>
                <th className="py-2 pr-3 text-right font-medium">Break-even</th>
                <th className="py-2 pr-3 text-right font-medium">Needs</th>
                <th className="py-2 text-right font-medium">Unrealized</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.ticker} className="border-b border-hairline">
                  <td className="py-2 pr-3 font-medium">{h.ticker}</td>
                  <td className="tabular py-2 pr-3 text-right">
                    {h.recoverCents === 0
                      ? <span className="text-ink-muted">—</span>
                      : formatMoney(h.recoverCents, { cents: false })}
                  </td>
                  <td className="tabular py-2 pr-3 text-right text-ink-secondary">
                    {price(h.meanCents)}
                  </td>
                  <td className="tabular py-2 pr-3 text-right text-ink-secondary">
                    {units(h.units)}
                  </td>
                  <td className="tabular py-2 pr-3 text-right text-ink-secondary">
                    {h.priceCents === null ? '—' : price(h.priceCents)}
                  </td>
                  <td className="tabular py-2 pr-3 text-right font-medium">
                    {price(h.breakEvenCents)}
                    {h.breakEvenMultiple > 1.005 && (
                      <div className="text-xs font-normal text-ink-muted">
                        {h.breakEvenMultiple.toFixed(2)}× mean
                      </div>
                    )}
                  </td>
                  <td className="tabular py-2 pr-3 text-right">
                    <Gap pct={h.gapPct} cleared={h.cleared} />
                  </td>
                  <td className="tabular py-2 text-right">
                    {h.unrealisedCents === null ? (
                      <span className="text-ink-muted">—</span>
                    ) : (
                      <span className={h.unrealisedCents >= 0 ? 'text-delta-good' : 'text-ink-secondary'}>
                        {h.unrealisedCents > 0 ? '+' : ''}
                        {formatMoney(h.unrealisedCents, { cents: false })}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-sm font-medium">
                <td className="py-2 pr-3">Total</td>
                <td className="tabular py-2 pr-3 text-right">
                  {formatMoney(summary.heldRecoverCents, { cents: false })}
                </td>
                <td colSpan={4} />
                <td className="py-2 pr-3" />
                <td className="tabular py-2 text-right">
                  {summary.unrealisedCents === null
                    ? '—'
                    : `${summary.unrealisedCents > 0 ? '+' : ''}${formatMoney(summary.unrealisedCents, { cents: false })}`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {stretch.count > 0 && (
          <p className="mt-4 border-t border-hairline pt-3 text-xs text-ink-muted">
            {stretch.count} of these need to more than double from your mean price, carrying{' '}
            {formatMoney(stretch.cents, { cents: false })} of the outstanding total
            {summary.remainingCents > 0 && (
              <> — {formatPercent(stretch.cents / summary.remainingCents)} of it</>
            )}
            .
          </p>
        )}
      </section>

      {closed.length > 0 && (
        <section className="card p-5">
          <h2 className="text-base font-semibold">Closed, with nothing behind them</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-secondary">
            {formatMoney(summary.closedRecoverCents, { cents: false })} across{' '}
            {closed.length} tickers you no longer hold. There is no break-even price for
            these, because there is no position to sell — the only way they come back is
            re-entering the name and earning it there.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5">
            {[...closed]
              .sort((a, b) => b.recoverCents - a.recoverCents)
              .map((c) => (
                <span key={c.ticker} className="tabular text-sm">
                  <span className="font-medium">{c.ticker}</span>{' '}
                  <span className="text-ink-secondary">
                    {formatMoney(c.recoverCents, { cents: false })}
                  </span>
                </span>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
