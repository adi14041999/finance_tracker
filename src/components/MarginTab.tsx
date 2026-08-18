'use client';

import { useMemo } from 'react';
import type { MarginReading } from '@/lib/types';
import {
  marginRows, marginSummary, marginSchedule, MARGIN_ANCHOR, type MarginRow,
} from '@/lib/derive/margin';
import { formatMoney, formatMoneyCompact, formatPercent } from '@/lib/money';

/**
 * Margin is a debt, so it gets the debt colour throughout — one hue, not a
 * diverging pair. There is no "good" and "bad" side of a balance to encode;
 * there is only more of it or less. Direction is carried by the words and the
 * arrow instead, which survives greyscale and colour-vision deficiency.
 */
const LINE = 'var(--series-2)';

function prettyDate(date: string): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = date.split('-');
  return `${names[Number(m) - 1]} ${Number(d)}, ${y}`;
}

/**
 * The balance over time.
 *
 * Drawn from zero rather than from the lowest reading. On a debt the distance
 * to zero IS the story — a chart cropped to the data would make $9,400 and
 * $7,850 look like a collapse, when it is a 16% step on the way down.
 */
function MarginLine({ rows }: { rows: MarginRow[] }) {
  const W = 900;
  const H = 220;
  const PAD = { top: 16, right: 20, bottom: 30, left: 66 };
  if (rows.length === 0) return null;

  const hi = Math.max(...rows.map((r) => r.marginCents), 1);
  const x = (i: number) =>
    PAD.left + (rows.length === 1 ? 0 : (i / (rows.length - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - v / hi) * (H - PAD.top - PAD.bottom);

  const points = rows.map((r, i) => `${x(i)},${y(r.marginCents)}`).join(' ');
  const area = `${PAD.left},${y(0)} ${points} ${x(rows.length - 1)},${y(0)}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-surface w-full" style={{ height: H }}
      role="img" aria-label="Margin balance at each reading">
      {[hi, hi / 2, 0].map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)}
            stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth="1" />
          <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="tabular"
            fontSize="11" fill="var(--text-muted)">{formatMoneyCompact(v)}</text>
        </g>
      ))}

      {rows.length > 1 && (
        <>
          <polygon points={area} fill={LINE} opacity="0.08" />
          <polyline points={points} fill="none" stroke={LINE} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" />
        </>
      )}

      {rows.map((r, i) => (
        <g key={r.date}>
          <circle cx={x(i)} cy={y(r.marginCents)} r={rows.length > 20 ? 2.5 : 3.5} fill={LINE}>
            <title>{`${prettyDate(r.date)}: ${formatMoney(r.marginCents, { cents: false })}`}</title>
          </circle>
          {/* Labels only when they'd fit. Past a dozen readings they collide
              and the table below is the better place to read exact figures. */}
          {rows.length <= 12 && (
            <text x={x(i)} y={y(r.marginCents) - 10} textAnchor="middle"
              className="tabular" fontSize="10" fill="var(--text-secondary)">
              {formatMoneyCompact(r.marginCents)}
            </text>
          )}
        </g>
      ))}

      {rows.length <= 12 && rows.map((r, i) => (
        <text key={`x-${r.date}`} x={x(i)} y={H - 10} textAnchor="middle"
          fontSize="10" fill="var(--text-muted)">
          {prettyDate(r.date).slice(0, 6)}
        </text>
      ))}
    </svg>
  );
}

export default function MarginTab({
  margin, today,
}: {
  margin: MarginReading[];
  today: string;
}) {
  const rows = useMemo(() => marginRows(margin), [margin]);
  const summary = useMemo(() => marginSummary(rows), [rows]);
  const schedule = useMemo(() => marginSchedule(rows, today), [rows, today]);
  const table = useMemo(() => [...rows].reverse(), [rows]);

  const due = schedule.overdue
    ? `${-schedule.daysUntil} day${schedule.daysUntil === -1 ? '' : 's'} overdue`
    : schedule.daysUntil === 0
      ? 'due today'
      : `due in ${schedule.daysUntil} day${schedule.daysUntil === 1 ? '' : 's'}`;

  if (margin.length === 0) {
    return (
      <div className="space-y-8">
        <div className="card p-8">
          <h2 className="text-base font-semibold">Tracking starts {prettyDate(MARGIN_ANCHOR)}</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
            Add a row to the <code className="rounded bg-sunken px-1">margin</code> tab
            every Monday with the balance you owe. Two columns:{' '}
            <code className="rounded bg-sunken px-1">date</code> as{' '}
            <code className="rounded bg-sunken px-1">2026-08-17</code>, and{' '}
            <code className="rounded bg-sunken px-1">margin</code> as a positive amount —{' '}
            <span className="tabular">12000</span> means $12,000 borrowed,{' '}
            <span className="tabular">0</span> means clear.
          </p>
          <p className="mt-4 text-sm font-medium">First reading {due}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="card p-6">
        <div className="text-sm text-ink-secondary">
          Borrowed on margin{summary.currentDate && `, as of ${prettyDate(summary.currentDate)}`}
        </div>
        <div className="mt-1 text-5xl font-semibold tracking-tight">
          {formatMoney(summary.currentCents, { cents: false })}
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          {summary.changeCents !== null && summary.changeCents !== 0 && (
            <span>
              <span className="tabular font-medium">
                {summary.changeCents < 0 ? '↓' : '↑'}{' '}
                {formatMoney(Math.abs(summary.changeCents), { cents: false })}
              </span>
              <span className="text-ink-muted"> since the reading before</span>
            </span>
          )}
          {summary.changeCents === 0 && (
            <span className="text-ink-muted">unchanged since the reading before</span>
          )}
          {summary.offPeak != null && summary.offPeak > 0 && (
            <span>
              <span className="tabular font-medium">{formatPercent(summary.offPeak, 0)}</span>
              <span className="text-ink-muted">
                {' '}below the peak of {formatMoney(summary.peakCents, { cents: false })}
              </span>
            </span>
          )}
        </div>

        <div
          className={[
            'mt-5 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs',
            schedule.overdue
              ? 'border-warning/40 bg-warning/10 text-ink-secondary'
              : 'border-hairline text-ink-secondary',
          ].join(' ')}
        >
          <span className="font-medium text-ink">Next reading {prettyDate(schedule.nextDue)}</span>
          <span>· {due}</span>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold">Balance over time</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Scaled from zero, because on a debt the distance left to zero is the point.
        </p>
        <div className="mt-3">
          <MarginLine rows={rows} />
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">Readings</h2>
          <p className="tabular text-xs text-ink-muted">
            {formatMoney(summary.paidDownCents, { cents: false })} paid down ·{' '}
            {formatMoney(summary.borrowedCents, { cents: false })} borrowed ·{' '}
            {summary.readings} reading{summary.readings === 1 ? '' : 's'}
          </p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 text-right font-medium">Margin</th>
                <th className="py-2 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.date} className="border-b border-hairline">
                  <td className="py-2 pr-3">
                    {prettyDate(r.date)}
                    {r.daysSince !== null && r.daysSince !== 7 && (
                      <span className="ml-2 text-xs text-ink-muted">
                        {r.daysSince}d gap
                      </span>
                    )}
                  </td>
                  <td className="tabular py-2 pr-3 text-right font-medium">
                    {formatMoney(r.marginCents, { cents: false })}
                  </td>
                  <td className="tabular py-2 text-right">
                    {r.changeCents === null ? (
                      <span className="text-ink-muted">—</span>
                    ) : r.changeCents === 0 ? (
                      <span className="text-ink-muted">no change</span>
                    ) : (
                      <>
                        {r.changeCents < 0 ? '↓' : '↑'}{' '}
                        {formatMoney(Math.abs(r.changeCents), { cents: false })}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
