'use client';

import { useMemo, useState } from 'react';
import type { Roll } from '@/lib/types';
import {
  rollRows, rollSummary, rollEvents, sortRolls, type RollSort, type RollRow,
} from '@/lib/derive/rolls';
import { formatMoney, formatPercent } from '@/lib/money';

const SORTS: { key: RollSort; label: string }[] = [
  { key: 'remaining', label: 'Most outstanding' },
  { key: 'progress', label: 'Best recovered' },
  { key: 'cost', label: 'Largest roll' },
  { key: 'date', label: 'Most recent' },
  { key: 'ticker', label: 'Ticker' },
];

function prettyDate(date: string): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = date.split('-');
  return `${names[Number(m) - 1]} ${Number(d)}, ${y}`;
}

/** Strikes are plain numbers, and 37.5 should not print as 37.50. */
function strike(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * The recovery plan itself: one horizontal bar per roll.
 *
 * Two things are encoded in one mark, which is the whole reason this beats a
 * table. Bar LENGTH is what the roll cost, so a $65,200 roll draws four times
 * the bar of a $15,150 one. Bar FILL is how much has come back. A long bar
 * barely filled is therefore the thing your eye lands on first, and that is
 * exactly the roll that matters most — big, and hardly started.
 *
 * A table of percentages cannot do this: 9.7% and 42.2% look comparable side by
 * side, even though one is $58,878 outstanding and the other is $665.
 */
function RecoveryPlan({ rows }: { rows: RollRow[] }) {
  const max = Math.max(...rows.map((r) => r.totalCostCents), 1);

  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const width = (r.totalCostCents / max) * 100;
        const fill = r.pctRecovered === null ? 0 : Math.min(1, Math.max(0, r.pctRecovered));
        return (
          <div key={`${r.ticker}-${r.date}-${r.row}`} className="flex items-center gap-3">
            <div className="w-32 shrink-0">
              <div className="text-sm font-medium">{r.ticker}</div>
              <div className="text-xs text-ink-muted">{shortDate(r.date)}</div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="h-6 rounded" style={{ width: `${width}%`, minWidth: '2px' }}>
                {/* The track is the full cost; the fill is what has come back.
                    A 2px gap of surface between them rather than a border. */}
                <div className="relative h-full overflow-hidden rounded bg-sunken">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-series-1"
                    style={{ width: `${fill * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="w-44 shrink-0 text-right">
              <div className="tabular text-sm">
                <span className="text-series-1">
                  {formatMoney(r.recoveredCents, { cents: false })}
                </span>
                <span className="text-ink-muted"> of </span>
                <span className="font-medium">
                  {formatMoney(r.totalCostCents, { cents: false })}
                </span>
              </div>
              <div className="tabular text-xs text-ink-muted">
                {r.pctRecovered == null ? '—' : formatPercent(r.pctRecovered, 1)}
                {' · '}
                {formatMoney(r.remainingCents, { cents: false })} to go
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function shortDate(date: string): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = date.split('-');
  return `${names[Number(m) - 1]} ${Number(d)}, ${y.slice(2)}`;
}

export default function RollsTab({ rolls }: { rolls: Roll[] }) {
  const [sort, setSort] = useState<RollSort>('remaining');

  const all = useMemo(() => rollRows(rolls), [rolls]);
  const summary = useMemo(() => rollSummary(all), [all]);
  const events = useMemo(() => rollEvents(all), [all]);
  const rows = useMemo(() => sortRolls(all, sort), [all, sort]);

  if (rolls.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-ink-secondary">
          Nothing on the <code className="rounded bg-sunken px-1">rolls</code> tab yet. Add
          a row per roll with the ticker, the date, the strikes you moved between, the
          cost and how much you&apos;ve collected back.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="card p-6">
        <div className="text-sm text-ink-secondary">
          Paid to roll {summary.contracts} contract{summary.contracts === 1 ? '' : 's'} across{' '}
          {summary.rollCount} roll{summary.rollCount === 1 ? '' : 's'}
        </div>
        {/* Proportional figures, not tabular — equal-width digits read loose at
            display sizes. Tabular is for columns that line up vertically. */}
        <div className="mt-1 text-5xl font-semibold tracking-tight">
          {formatMoney(summary.totalCostCents, { cents: false })}
        </div>

        <div className="mt-6">
          <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-series-1"
              style={{ width: `${Math.min(1, Math.max(0, summary.progress)) * 100}%` }}
            />
          </div>
          <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
            <div>
              <span className="tabular text-xl font-semibold text-series-1">
                {formatMoney(summary.recoveredCents, { cents: false })}
              </span>
              <span className="ml-2 tabular text-xs text-ink-muted">
                {formatPercent(summary.progress, 1)}
              </span>
              <div className="mt-0.5 text-xs text-ink-muted">
                collected back in premium since
              </div>
            </div>
            <div className="text-right">
              <span className="tabular text-xl font-semibold">
                {formatMoney(summary.remainingCents, { cents: false })}
              </span>
              <div className="mt-0.5 text-xs text-ink-muted">still to earn back</div>
            </div>
          </div>
        </div>
      </section>

      {events.length > 0 && (
        <section className="card p-5">
          <h2 className="text-base font-semibold">
            {events.length === 1 ? 'The day you rolled' : 'The days you rolled'}
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Rolling happens in bursts — one decision across the book, not one position at
            a time. Each of these is a single day.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {events.map((e) => (
              <div key={e.date} className="rounded-lg border border-hairline p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{prettyDate(e.date)}</span>
                  <span className="tabular text-lg font-semibold">
                    {formatMoney(e.totalCostCents, { cents: false })}
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-sunken">
                  <div
                    className="h-full rounded-full bg-series-1"
                    style={{
                      width: `${Math.min(1, Math.max(0, e.recoveredCents / e.totalCostCents)) * 100}%`,
                    }}
                  />
                </div>
                <div className="tabular mt-2 text-xs text-ink-muted">
                  {formatMoney(e.recoveredCents, { cents: false })} back
                  {' · '}
                  {formatMoney(e.remainingCents, { cents: false })} to go
                </div>
                <div className="mt-1.5 text-xs text-ink-secondary">
                  {e.tickers.join(', ')}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card p-5">
        <h2 className="text-base font-semibold">The plan</h2>
        <p className="mt-0.5 max-w-3xl text-xs text-ink-muted">
          One bar per roll. Its length is what the roll cost, so the big ones look big;
          the filled part is what you&apos;ve collected back since. Longest bar with the
          least colour in it is where the most money is still sitting.
        </p>
        <div className="mt-5">
          <RecoveryPlan rows={sortRolls(all, 'cost')} />
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Every roll</h2>
            <p className="mt-0.5 max-w-2xl text-xs text-ink-muted">
              Each roll is its own ledger. Two rolls on the same ticker are separate
              obligations with separate strikes, so they&apos;re never merged.
            </p>
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as RollSort)}
            className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm"
            aria-label="Sort rolls"
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
                <th className="py-2 pr-3 font-medium">Rolled</th>
                <th className="py-2 pr-3 font-medium">Strike</th>
                <th className="py-2 pr-3 text-right font-medium">Contracts</th>
                <th className="py-2 pr-3 text-right font-medium">Cost</th>
                <th className="py-2 pr-3 text-right font-medium">Collected back</th>
                <th className="py-2 text-right font-medium">Still to earn</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.ticker}-${r.date}-${r.row}`} className="border-b border-hairline">
                  <td className="py-2 pr-3 font-medium">{r.ticker}</td>
                  <td className="py-2 pr-3 text-ink-secondary">{prettyDate(r.date)}</td>
                  <td className="tabular py-2 pr-3 text-ink-secondary">
                    {strike(r.strikeFrom)} → {strike(r.strikeTo)}
                    <div className="text-xs text-ink-muted">
                      +{strike(r.strikeMoved)} points
                    </div>
                  </td>
                  <td className="tabular py-2 pr-3 text-right text-ink-secondary">
                    {r.contracts}
                  </td>
                  <td className="tabular py-2 pr-3 text-right font-medium">
                    {formatMoney(r.totalCostCents, { cents: false })}
                    {r.contracts > 1 && (
                      <div className="text-xs font-normal text-ink-muted">
                        {formatMoney(r.costCents, { cents: false })} each
                      </div>
                    )}
                  </td>
                  <td className="tabular py-2 pr-3 text-right">
                    {formatMoney(r.recoveredCents, { cents: false })}
                    {r.pctRecovered != null && (
                      <span className="ml-2 text-xs text-ink-muted">
                        {formatPercent(r.pctRecovered, 1)}
                      </span>
                    )}
                  </td>
                  <td className="tabular py-2 text-right">
                    {r.remainingCents <= 0 ? (
                      <span className="text-delta-good">cleared</span>
                    ) : (
                      formatMoney(r.remainingCents, { cents: false })
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-sm font-medium">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3" />
                <td className="tabular py-2 pr-3 text-right">{summary.contracts}</td>
                <td className="tabular py-2 pr-3 text-right">
                  {formatMoney(summary.totalCostCents, { cents: false })}
                </td>
                <td className="tabular py-2 pr-3 text-right">
                  {formatMoney(summary.recoveredCents, { cents: false })}
                </td>
                <td className="tabular py-2 text-right">
                  {formatMoney(summary.remainingCents, { cents: false })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
