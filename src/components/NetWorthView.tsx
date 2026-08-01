'use client';

import { useMemo, useState } from 'react';
import type { Account, Balance, Config } from '@/lib/types';
import {
  netWorthSeries, netWorthSummary, accountTable, gapMonths, visibleSeries, LOOKBACKS,
} from '@/lib/derive/networth';
import type { Change as ChangeValue } from '@/lib/derive/networth';
import { formatMoney, formatPercent, pctChange } from '@/lib/money';
import { formatMonth } from '@/lib/dates';
import { RANGES, type Range } from '@/lib/range';
import LineChart from './LineChart';
import StatTile from './StatTile';
import DonutChart from './DonutChart';

/**
 * A change in dollars with the percentage beneath it.
 *
 * Both, rather than either: "+$70,737" tells you how much moved, "+11.6%" tells
 * you whether that was a big move for this account. The percentage is omitted
 * when the previous balance was zero, since $0 -> $64 has no honest percentage
 * and printing one would be worse than printing nothing.
 */
function Change({ change }: { change: ChangeValue }) {
  const { cents, pct } = change;
  if (cents == null) {
    return <td className="tabular py-2 pr-3 text-right text-ink-muted">—</td>;
  }
  const good = cents > 0;
  return (
    <td className="tabular py-2 pr-3 text-right align-top">
      <div className={good ? 'text-delta-good' : 'text-ink-secondary'}>
        {good ? '+' : ''}
        {formatMoney(cents, { cents: false })}
      </div>
      {pct != null && (
        <div className="text-xs text-ink-muted">
          {pct > 0 ? '+' : ''}
          {formatPercent(pct, 1)}
        </div>
      )}
    </td>
  );
}

const CLASS_LABEL: Record<string, string> = {
  cash: 'Cash',
  investment: 'Investment',
  liability: 'Debt',
};

export default function NetWorthView({
  accounts, balances, config,
}: {
  accounts: Account[];
  balances: Balance[];
  config: Config;
}) {
  // Every figure comes from the full history; start_month only trims the chart.
  const series = useMemo(() => netWorthSeries(accounts, balances), [accounts, balances]);
  const [range, setRange] = useState<Range>('all');
  const charted = useMemo(() => visibleSeries(series, range), [series, range]);
  const summary = useMemo(() => netWorthSummary(series, config), [series, config]);
  const rows = useMemo(() => accountTable(series), [series]);
  const gaps = useMemo(() => gapMonths(series), [series]);

  if (series.length === 0 || !summary.current) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Net Worth</h1>
        <div className="card p-8 text-center">
          <p className="text-sm text-ink-secondary">
            No balance rows yet. Add one row per account to the{' '}
            <code className="rounded bg-sunken px-1">balances</code> tab, dated the last
            day of the month, and this page will fill in.
          </p>
        </div>
      </div>
    );
  }

  const months = charted.map((p) => p.month);
  const changePct = summary.previous
    ? pctChange(summary.previous.netCents, summary.current.netCents)
    : null;

  const accountNames = new Map(accounts.map((a) => [a.accountId, a.name]));

  const assetSlices = summary.current.accounts
    .filter((a) => a.klass !== 'liability' && a.signedCents > 0)
    .map((a) => ({ key: a.accountId, label: a.name, valueCents: a.signedCents }));

  // Only balances you actually owe belong in a part-to-whole chart. A card in
  // credit is money owed TO you — it still counts in net worth, it just isn't a
  // slice of your debt, and a pie can't render a negative wedge anyway.
  const debtSlices = summary.current.accounts
    .filter((a) => a.klass === 'liability' && a.rawCents > 0)
    .map((a) => ({ key: a.accountId, label: a.name, valueCents: a.rawCents }));

  const credits = summary.current.accounts.filter(
    (a) => a.klass === 'liability' && a.rawCents < 0,
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Net Worth</h1>
        <p className="mt-0.5 text-sm text-ink-secondary">
          Every account, as of {formatMonth(summary.current.month)}.
        </p>
      </header>

      <section className="card p-6">
        <div className="text-sm text-ink-secondary">Net worth</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-4">
          <span className="text-5xl font-semibold tracking-tight">
            {formatMoney(summary.current.netCents, { cents: false })}
          </span>
          {summary.changeCents != null && (
            <span className="flex items-center gap-1.5 text-sm">
              <span
                aria-hidden
                className={summary.changeCents >= 0 ? 'text-delta-good' : 'text-ink-secondary'}
              >
                {summary.changeCents >= 0 ? '↑' : '↓'}
              </span>
              <span className={summary.changeCents >= 0 ? 'text-delta-good' : 'text-ink-secondary'}>
                {formatMoney(Math.abs(summary.changeCents), { cents: false })}
                {changePct != null && ` (${formatPercent(Math.abs(changePct), 1)})`}
              </span>
              <span className="text-ink-muted">since last month</span>
            </span>
          )}
        </div>

        {summary.goalRatio != null && summary.goalCents != null && (
          <div className="mt-5">
            <div className="flex items-baseline justify-between text-xs text-ink-muted">
              <span>Progress to {formatMoney(summary.goalCents, { cents: false })}</span>
              <span className="tabular">{formatPercent(summary.goalRatio, 1)}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-sunken">
              <div
                className="h-full rounded-full bg-series-1"
                style={{ width: `${Math.min(1, Math.max(0, summary.goalRatio)) * 100}%` }}
              />
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Cash"
          valueCents={summary.current.cashCents}
          deltaCents={
            summary.previous ? summary.current.cashCents - summary.previous.cashCents : null
          }
          hint={
            summary.cashShare != null
              ? `${formatPercent(summary.cashShare)} of assets — money you can spend today`
              : undefined
          }
        />
        <StatTile
          label="Investments"
          valueCents={summary.current.investmentCents}
          deltaCents={
            summary.previous
              ? summary.current.investmentCents - summary.previous.investmentCents
              : null
          }
          hint="Brokerage, retirement, HSA, crypto."
        />
        <StatTile
          label="Debts"
          valueCents={summary.current.liabilitiesCents}
          deltaCents={
            summary.previous
              ? summary.current.liabilitiesCents - summary.previous.liabilitiesCents
              : null
          }
          invertDelta
          hint="Shown negative; falling debt counts as progress."
        />
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">History</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              {charted.length} month{charted.length === 1 ? '' : 's'} to{' '}
              {formatMonth(summary.current.month)}. Net worth, with cash and investments
              underneath — the gap is what you owe.
            </p>
          </div>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm"
            aria-label="Time range"
          >
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="mt-4">
          <LineChart
            months={months}
            height={280}
            series={[
              {
                key: 'net',
                label: 'Net worth',
                values: charted.map((p) => p.netCents),
                color: 'var(--series-1)',
                area: true,
              },
              {
                key: 'investments',
                label: 'Investments',
                values: charted.map((p) => p.investmentCents),
                color: 'var(--series-2)',
                dash: '6 3',
              },
              {
                key: 'cash',
                label: 'Cash',
                values: charted.map((p) => p.cashCents),
                color: 'var(--series-3)',
                dash: '2 3',
              },
            ]}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-base font-semibold">Where it sits</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Share of assets, cash and investments together.
          </p>
          <div className="mt-4">
            <DonutChart
              centreLabel="Assets"
              slices={assetSlices}
            />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold">What you owe</h2>
          <p className="mt-0.5 text-xs text-ink-muted">Share of debt, by account.</p>
          <div className="mt-4">
            <DonutChart centreLabel="Owed" slices={debtSlices} />
          </div>
          {credits.length > 0 && (
            <p className="mt-3 text-xs text-ink-muted">
              Not shown: {credits.map((c) => c.name).join(', ')}{' '}
              {credits.length === 1 ? 'is' : 'are'} in credit
              {' '}({credits.map((c) => formatMoney(-c.rawCents, { cents: false })).join(', ')}).
              A card that owes you isn&apos;t part of what you owe, but it does count
              toward net worth above.
            </p>
          )}
        </section>
      </div>

      <section className="card p-5">
        <h2 className="text-base font-semibold">Accounts</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                <th className="py-2 pr-3 font-medium">Account</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 text-right font-medium">Balance</th>
                {LOOKBACKS.map((n) => (
                  <th key={n} className="py-2 pr-3 text-right font-medium">
                    {n === 12 ? '1 year' : n === 1 ? '1 month' : `${n} months`}
                  </th>
                ))}
                <th className="py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.accountId} className="border-b border-hairline">
                  <td className="py-2 pr-3">
                    <span>{r.name}</span>
                    {r.carried && (
                      <span
                        className="ml-2 rounded bg-warning/20 px-1.5 py-0.5 text-xs"
                        title="No row for this month; the previous month's figure was carried forward."
                      >
                        carried forward
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-ink-secondary">{CLASS_LABEL[r.klass]}</td>
                  <td className="tabular py-2 pr-3 text-right font-medium">
                    {formatMoney(r.currentCents, { cents: false })}
                  </td>
                  {LOOKBACKS.map((n) => (
                    <Change key={n} change={r.changes[n]} />
                  ))}
                  <td className="tabular py-2 text-right text-ink-muted">
                    {r.shareOfAssets == null ? '—' : formatPercent(r.shareOfAssets)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {gaps.length > 0 && (
        <section className="card border-warning/40 p-5">
          <h2 className="text-base font-semibold">Gaps in your records</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            Some months are missing a balance row for an account that existed at the
            time. Rather than let net worth jump, the previous month&apos;s figure was
            carried forward — so those stretches are slightly stale, not wrong.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-ink-secondary">
            {gaps.slice(0, 8).map((g) => (
              <li key={g.month} className="tabular">
                <span className="font-medium text-ink">{formatMonth(g.month)}</span>
                {' — '}
                {g.accountIds.map((id) => accountNames.get(id) ?? id).join(', ')}
              </li>
            ))}
            {gaps.length > 8 && (
              <li className="text-ink-muted">…and {gaps.length - 8} more months.</li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
