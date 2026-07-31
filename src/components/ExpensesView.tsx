'use client';

import { useMemo, useState } from 'react';
import type { Transaction, Category, Budget, Config } from '@/lib/types';
import { monthSummary, spendTrend, topCategories } from '@/lib/derive/expenses';
import { formatMoney, formatPercent } from '@/lib/money';
import { addMonths, formatMonth, formatDayMonth } from '@/lib/dates';
import BudgetBar from './BudgetBar';
import DonutChart from './DonutChart';
import LineChart from './LineChart';

interface Props {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  config: Config;
  today: string;
  months: string[];
}

/**
 * The whole Expenses page runs client-side off data the server already loaded.
 * Switching month or typing in the search box is then instant — no round trip —
 * and the derive functions are the same pure ones the tests cover.
 */
export default function ExpensesView(props: Props) {
  const { transactions, categories, budgets, config, today, months } = props;

  const [month, setMonth] = useState(months[months.length - 1] ?? today.slice(0, 7));
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [trendCategory, setTrendCategory] = useState('');

  const summary = useMemo(
    () => monthSummary(transactions, categories, budgets, config, month, today),
    [transactions, categories, budgets, config, month, today],
  );

  const trendMonths = useMemo(() => {
    const out: string[] = [];
    for (let i = 11; i >= 0; i--) out.push(addMonths(month, -i));
    return out;
  }, [month]);

  const trend = useMemo(
    () => spendTrend(transactions, trendMonths, trendCategory || null),
    [transactions, trendMonths, trendCategory],
  );

  const ledger = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions
      .filter((t) => t.month === month)
      .filter((t) => !categoryFilter || t.category === categoryFilter)
      .filter(
        (t) =>
          !q ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q),
      );
  }, [transactions, month, query, categoryFilter]);

  const pace = summary.targetRatio != null ? summary.targetRatio - summary.elapsed : null;

  // Same categories as the budget panel, but ranked by size rather than by how
  // far over budget they are — a different question, so a different sort.
  const ranked = useMemo(() => topCategories(summary, 50), [summary]);
  const biggest = ranked[0] ?? null;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses &amp; Budgeting</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            {summary.transactionCount} expense{summary.transactionCount === 1 ? '' : 's'} in{' '}
            {formatMonth(month)}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-secondary">Month</span>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm"
          >
            {[...months].reverse().map((m) => (
              <option key={m} value={m}>{formatMonth(m)}</option>
            ))}
          </select>
        </label>
      </header>

      {/* Headline: spend against target, with pace so the number has context. */}
      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-ink-secondary">Spent this month</div>
            <div className="mt-1 text-4xl font-semibold tracking-tight">
              {formatMoney(summary.totalCents, { cents: false })}
            </div>
          </div>
          {summary.targetCents != null && (
            <div className="text-right">
              <div className="text-sm text-ink-secondary">
                of {formatMoney(summary.targetCents, { cents: false })} target
              </div>
              <div className="mt-1 text-sm">
                {pace != null && (
                  <span
                    className={
                      pace > 0.05 ? 'font-medium text-critical'
                      : pace < -0.05 ? 'text-delta-good'
                      : 'text-ink-secondary'
                    }
                  >
                    {pace > 0.05 && `Running hot — ${formatPercent(summary.targetRatio!)} spent, ${formatPercent(summary.elapsed)} through the month`}
                    {pace < -0.05 && `On track — ${formatPercent(summary.targetRatio!)} spent, ${formatPercent(summary.elapsed)} through the month`}
                    {pace >= -0.05 && pace <= 0.05 && `Right on pace at ${formatPercent(summary.targetRatio!)}`}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {summary.targetCents != null && (
          <div className="relative mt-4 h-2 rounded-full bg-sunken">
            <div
              className={`h-full rounded-full ${
                (summary.targetRatio ?? 0) > 1 ? 'bg-critical' : 'bg-series-1'
              }`}
              style={{ width: `${Math.min(1, summary.targetRatio ?? 0) * 100}%` }}
            />
            {/* Where you'd be if you spent evenly across the month. */}
            <div
              className="absolute top-[-3px] h-[14px] w-px bg-ink"
              style={{ left: `${summary.elapsed * 100}%` }}
              title="Today, if you spent evenly across the month"
            />
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-hairline pt-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-muted">Per day so far</dt>
            <dd className="tabular mt-0.5 font-medium">
              {formatMoney(summary.dailyAverageCents, { cents: false })}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Biggest category</dt>
            <dd className="mt-0.5 truncate font-medium">
              {biggest ? (
                <>
                  {biggest.category}{' '}
                  <span className="tabular text-ink-secondary">
                    {formatMoney(biggest.spentCents, { cents: false })}
                  </span>
                </>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Budgeted</dt>
            <dd className="tabular mt-0.5 font-medium">
              {summary.budgetedTotalCents > 0
                ? formatMoney(summary.budgetedTotalCents, { cents: false })
                : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-base font-semibold">Budget vs actual</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Worst first, so problems surface at the top.
          </p>
          <div className="mt-3 divide-y divide-hairline">
            {summary.categories.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">
                No expenses recorded for {formatMonth(month)}.
              </p>
            ) : (
              summary.categories.map((c) => <BudgetBar key={c.category} item={c} />)
            )}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold">Where it went</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Share of the month. Anything past the top five folds into Other.
          </p>
          <div className="mt-4">
            <DonutChart
              centreLabel={formatMonth(month)}
              slices={ranked.map((c) => ({
                key: c.category,
                label: c.category,
                valueCents: c.spentCents,
              }))}
            />
          </div>
        </section>
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Trend</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Twelve months to {formatMonth(month)}, with a 3-month average so one big
              month doesn&apos;t read as a trend.
            </p>
          </div>
          <select
            value={trendCategory}
            onChange={(e) => setTrendCategory(e.target.value)}
            className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm"
            aria-label="Category to chart"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>{c.category}</option>
            ))}
          </select>
        </div>
        <div className="mt-4">
          <LineChart
            months={trendMonths}
            series={[
              {
                key: 'total',
                label: trendCategory || 'Monthly spend',
                values: trend.map((p) => p.totalCents),
                color: 'var(--series-1)',
                area: true,
              },
              {
                key: 'rolling',
                label: '3-month average',
                values: trend.map((p) => p.rollingCents),
                color: 'var(--series-2)',
                dashed: true,
              },
            ]}
          />
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Ledger</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.category} value={c.category}>{c.category}</option>
              ))}
            </select>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search descriptions…"
              className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Description</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-ink-muted">
                    Nothing matches.
                  </td>
                </tr>
              ) : (
                ledger.map((t) => (
                  <tr key={`${t.row}-${t.date}`} className="border-b border-hairline">
                    <td className="tabular whitespace-nowrap py-2 pr-3 text-ink-secondary">
                      {formatDayMonth(t.date)}
                    </td>
                    <td className="py-2 pr-3">
                      {t.description || <span className="text-ink-muted">—</span>}
                    </td>
                    <td className="py-2 pr-3 text-ink-secondary">{t.category}</td>
                    <td
                      className={`tabular whitespace-nowrap py-2 text-right font-medium ${
                        t.amountCents < 0 ? 'text-delta-good' : ''
                      }`}
                    >
                      {t.amountCents < 0
                        ? `+${formatMoney(-t.amountCents)}`
                        : formatMoney(t.amountCents)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
