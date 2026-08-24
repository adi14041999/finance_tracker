'use client';

import { useMemo, useState } from 'react';
import type { EventMonth } from '@/lib/types';
import { eventRows, eventYears, eventSummary, type EventRow } from '@/lib/derive/events';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import { formatMonth } from '@/lib/dates';
import { RANGES, rangeStart, type Range } from '@/lib/range';
import MissionSection from './MissionSection';
import type { EplFixture, MissionDay } from '@/lib/types';

/**
 * Gains blue, losses orange — the same validated diverging pair used elsewhere.
 * Green/red fails colour-vision-deficiency separation (ΔE 4.1 under
 * deuteranopia against a floor of 8); blue/orange scores 24.7 and reads as
 * warm/cool opposites for everyone. Every mark is labelled too.
 */
const UP = 'var(--series-1)';
const DOWN = 'var(--series-2)';

const tone = (cents: number) => (cents === 0 ? 'var(--axis)' : cents > 0 ? UP : DOWN);
const signed = (cents: number) =>
  `${cents > 0 ? '+' : ''}${formatMoney(cents, { cents: false })}`;

/** Monthly realized P&L: above and below a baseline, so a diverging bar. */
function MonthlyBars({ rows }: { rows: EventRow[] }) {
  const W = 900;
  const H = 240;
  const PAD = { top: 14, right: 16, bottom: 44, left: 62 };
  if (rows.length === 0) return null;

  const values = rows.map((r) => r.totalCents);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const y = (v: number) => PAD.top + (1 - (v - lo) / span) * (H - PAD.top - PAD.bottom);
  const slot = (W - PAD.left - PAD.right) / rows.length;
  const barW = Math.max(4, slot - 8);
  const zero = y(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-surface w-full" style={{ height: H }}
      role="img" aria-label="Realized profit and loss by month">
      {[hi, 0, lo].map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)}
            stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth="1" />
          <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="tabular"
            fontSize="11" fill="var(--text-muted)">{formatMoneyCompact(v)}</text>
        </g>
      ))}

      {rows.map((r, i) => {
        const top = r.totalCents >= 0 ? y(r.totalCents) : zero;
        const h = Math.max(r.totalCents === 0 ? 0 : 2, Math.abs(y(r.totalCents) - zero));
        return (
          <g key={r.month}>
            <rect
              x={PAD.left + i * slot + (slot - barW) / 2} y={top}
              width={barW} height={h} rx="2" fill={tone(r.totalCents)}
            >
              <title>{`${formatMonth(r.month)}: ${signed(r.totalCents)}`}</title>
            </rect>
            <text
              x={PAD.left + i * slot + slot / 2} y={H - 12}
              textAnchor="middle" fontSize="10" fill="var(--text-muted)"
            >
              {formatMonth(r.month).slice(0, 3)}
            </text>
            {(i === 0 || r.month.slice(5) === '01') && (
              <text
                x={PAD.left + i * slot + slot / 2} y={H - 1}
                textAnchor="middle" fontSize="9" fill="var(--text-muted)"
              >
                {r.month.slice(0, 4)}
              </text>
            )}
          </g>
        );
      })}

      {/* Only the months that moved get a figure. A label on all twelve, six of
          them zero, would be noise on top of a chart that already says it. */}
      {rows.map((r, i) => {
        if (r.totalCents === 0) return null;
        const above = r.totalCents < 0;
        return (
          <text
            key={`v-${r.month}`}
            x={PAD.left + i * slot + slot / 2}
            y={above ? y(r.totalCents) + 13 : y(r.totalCents) - 6}
            textAnchor="middle" className="tabular" fontSize="10" fill="var(--text-secondary)"
          >
            {formatMoneyCompact(r.totalCents)}
          </text>
        );
      })}
    </svg>
  );
}

export default function EventsTab({
  events, mission, epl, today,
}: {
  events: EventMonth[];
  mission: MissionDay[];
  epl: EplFixture[];
  today: string;
}) {
  const [range, setRange] = useState<Range>('all');
  const rows = useMemo(() => eventRows(events), [events]);
  const years = useMemo(() => eventYears(rows), [rows]);
  const summary = useMemo(() => eventSummary(rows), [rows]);
  const table = useMemo(() => [...rows].reverse(), [rows]);

  // Trimmed after the rows are built, never before. Each month keeps the total
  // and year-to-date it has in full history, so narrowing the range changes
  // which bars are drawn and not one of the numbers on them.
  const charted = useMemo(() => {
    if (rows.length === 0) return rows;
    const start = rangeStart(range, rows[rows.length - 1].month, rows[0].month);
    return rows.filter((r) => r.month >= start);
  }, [rows, range]);

  if (events.length === 0) {
    return (
      <div className="space-y-8">
        <div className="card p-8 text-center">
        <p className="text-sm text-ink-secondary">
          Nothing on the <code className="rounded bg-sunken px-1">events</code> tab yet.
          It expects a row per month labelled like{' '}
          <code className="rounded bg-sunken px-1">January, 2026</code>, with the
          month&apos;s realized total beside it.
        </p>
        </div>
        <MissionSection mission={mission} epl={epl} today={today} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="card p-6">
        <div className="text-sm text-ink-secondary">
          Realized on event contracts{summary.latestYear && `, ${summary.latestYear}`}
        </div>
        <div className="mt-1 text-5xl font-semibold tracking-tight" style={{ color: tone(summary.ytdCents) }}>
          {signed(summary.ytdCents)}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="text-ink-muted">won</span>{' '}
            <span className="tabular font-medium" style={{ color: UP }}>
              {signed(summary.grossUpCents)}
            </span>
            <span className="text-ink-muted"> in {summary.monthsUp} month{summary.monthsUp === 1 ? '' : 's'}</span>
          </span>
          <span>
            <span className="text-ink-muted">lost</span>{' '}
            <span className="tabular font-medium" style={{ color: DOWN }}>
              {formatMoney(summary.grossDownCents, { cents: false })}
            </span>
            <span className="text-ink-muted"> in {summary.monthsDown} month{summary.monthsDown === 1 ? '' : 's'}</span>
          </span>
          {summary.monthsFlat > 0 && (
            <span className="text-ink-muted">{summary.monthsFlat} months flat</span>
          )}
        </div>
        <p className="mt-4 max-w-2xl text-xs text-ink-muted">
          Event contracts settle. Every figure here is final the moment it lands — there
          is no open position to mark and nothing outstanding to earn back.
        </p>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">By month</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              <span className="mr-3">
                <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: UP }} />
                won
              </span>
              <span className="mr-3">
                <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: DOWN }} />
                lost
              </span>
              <span>
                {charted.length} month{charted.length === 1 ? '' : 's'} shown.
              </span>
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
        <div className="mt-3">
          <MonthlyBars rows={charted} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold">Month by month</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                <th className="py-2 pr-3 font-medium">Month</th>
                <th className="py-2 pr-3 text-right font-medium">Realized</th>
                <th className="py-2 text-right font-medium">Year to date</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.month} className="border-b border-hairline">
                  <td className="py-2 pr-3">{formatMonth(r.month)}</td>
                  <td className="tabular py-2 pr-3 text-right font-medium"
                    style={{ color: tone(r.totalCents) }}>
                    {r.totalCents === 0 ? '—' : signed(r.totalCents)}
                  </td>
                  <td className="tabular py-2 text-right">
                    {formatMoney(r.ytdCents, { cents: false })}
                  </td>
                </tr>
              ))}
            </tbody>
            {years.length > 1 && (
              <tfoot>
                {years.map((y) => (
                  <tr key={y.year} className="text-sm font-medium">
                    <td className="py-2 pr-3">{y.year}</td>
                    <td className="tabular py-2 pr-3 text-right" style={{ color: tone(y.totalCents) }}>
                      {signed(y.totalCents)}
                    </td>
                    <td />
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <MissionSection mission={mission} epl={epl} today={today} />
    </div>
  );
}
