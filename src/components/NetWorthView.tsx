'use client';

import { useMemo } from 'react';
import type { Account, Balance, Config } from '@/lib/types';
import { netWorthSeries, netWorthSummary, accountTable, gapMonths } from '@/lib/derive/networth';
import { formatMoney, formatPercent, pctChange } from '@/lib/money';
import { formatMonth } from '@/lib/dates';
import LineChart from './LineChart';
import StatTile from './StatTile';
import BarList from './BarList';

export default function NetWorthView({
  accounts, balances, config,
}: {
  accounts: Account[];
  balances: Balance[];
  config: Config;
}) {
  const series = useMemo(
    () => netWorthSeries(accounts, balances, { startMonth: config.startMonth }),
    [accounts, balances, config.startMonth],
  );
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

  const months = series.map((p) => p.month);
  const changePct = summary.previous
    ? pctChange(summary.previous.netCents, summary.current.netCents)
    : null;

  const accountNames = new Map(accounts.map((a) => [a.accountId, a.name]));

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

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          label="Assets"
          valueCents={summary.current.assetsCents}
          deltaCents={
            summary.previous ? summary.current.assetsCents - summary.previous.assetsCents : null
          }
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
        <h2 className="text-base font-semibold">History</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Net worth against total assets — the gap between the two lines is what you owe.
        </p>
        <div className="mt-4">
          <LineChart
            months={months}
            height={280}
            series={[
              {
                key: 'net',
                label: 'Net worth',
                values: series.map((p) => p.netCents),
                color: 'var(--series-1)',
                area: true,
              },
              {
                key: 'assets',
                label: 'Assets',
                values: series.map((p) => p.assetsCents),
                color: 'var(--series-2)',
                dashed: true,
              },
            ]}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-base font-semibold">Where it sits</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Assets by account, with each one&apos;s share.
          </p>
          <div className="mt-4">
            <BarList
              items={summary.current.accounts
                .filter((a) => a.klass === 'asset' && a.signedCents > 0)
                .map((a) => ({
                  key: a.accountId,
                  label: a.name,
                  valueCents: a.signedCents,
                }))}
            />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold">What you owe</h2>
          <p className="mt-0.5 text-xs text-ink-muted">Debts by account.</p>
          <div className="mt-4">
            {summary.current.accounts.some((a) => a.klass === 'liability') ? (
              <BarList
                items={summary.current.accounts
                  .filter((a) => a.klass === 'liability')
                  .sort((a, b) => a.signedCents - b.signedCents)
                  .map((a) => ({
                    key: a.accountId,
                    label: a.name,
                    valueCents: a.rawCents,
                  }))}
              />
            ) : (
              <p className="py-6 text-center text-sm text-ink-muted">No debts recorded.</p>
            )}
          </div>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="text-base font-semibold">Accounts</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                <th className="py-2 pr-3 font-medium">Account</th>
                <th className="py-2 pr-3 text-right font-medium">Balance</th>
                <th className="py-2 pr-3 text-right font-medium">1 month</th>
                <th className="py-2 pr-3 text-right font-medium">1 year</th>
                <th className="py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.accountId} className="border-b border-hairline">
                  <td className="py-2 pr-3">
                    <span className={r.active ? '' : 'text-ink-muted'}>{r.name}</span>
                    {!r.active && (
                      <span className="ml-2 text-xs text-ink-muted">closed</span>
                    )}
                    {r.carried && (
                      <span
                        className="ml-2 rounded bg-warning/20 px-1.5 py-0.5 text-xs"
                        title="No row for this month; the previous month's figure was carried forward."
                      >
                        carried forward
                      </span>
                    )}
                  </td>
                  <td className="tabular py-2 pr-3 text-right font-medium">
                    {formatMoney(r.currentCents, { cents: false })}
                  </td>
                  <td className="tabular py-2 pr-3 text-right text-ink-secondary">
                    {r.changeMonthCents == null ? '—' : (
                      <span className={r.changeMonthCents > 0 ? 'text-delta-good' : ''}>
                        {r.changeMonthCents > 0 ? '+' : ''}
                        {formatMoney(r.changeMonthCents, { cents: false })}
                      </span>
                    )}
                  </td>
                  <td className="tabular py-2 pr-3 text-right text-ink-secondary">
                    {r.changeYearCents == null ? '—' : (
                      <span className={r.changeYearCents > 0 ? 'text-delta-good' : ''}>
                        {r.changeYearCents > 0 ? '+' : ''}
                        {formatMoney(r.changeYearCents, { cents: false })}
                      </span>
                    )}
                  </td>
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
