'use client';

import { useMemo, useState } from 'react';
import type { PremiumMonth } from '@/lib/types';
import {
  premiumDays, monthRows, yearRows, premiumStats, calendarYear, divergingScale,
  type PremiumDay,
} from '@/lib/derive/premiums';
import { formatMoney, formatMoneyCompact, formatPercent } from '@/lib/money';
import { formatMonth } from '@/lib/dates';
import { RANGES, rangeStart, type Range } from '@/lib/range';

/**
 * Gains read blue, losses orange — not the conventional green/red, because
 * green/red fails colour-vision-deficiency separation outright (ΔE 4.1 under
 * deuteranopia against a floor of 8). Blue/orange scores 24.7 and is a proper
 * warm/cool diverging pair, so the two poles read as opposite for everyone.
 * Every mark that uses it is also labelled, so colour is never the only channel.
 */
const UP = 'var(--series-1)';
const DOWN = 'var(--series-2)';

function tone(cents: number): string {
  return cents === 0 ? 'var(--axis)' : cents > 0 ? UP : DOWN;
}

function signed(cents: number, opts: { cents?: boolean } = {}): string {
  return `${cents > 0 ? '+' : ''}${formatMoney(cents, opts)}`;
}

function prettyDate(date: string): string {
  const [y, m, d] = date.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(m) - 1]} ${Number(d)}, ${y}`;
}

/* ------------------------------------------------------------ cumulative */

/**
 * The running total, which is the one chart that survives this data's scale.
 *
 * A chart of daily P&L cannot show a -$121,291 day and a $211 day at once: any
 * axis that fits the first flattens 940 of the others onto the zero line. The
 * cumulative curve sidesteps that entirely — a bad day is a cliff in a line
 * that is already scaled to six figures, so the ordinary days stay visible as
 * the slope between them.
 */
function CumulativeCurve({ days, worst }: { days: PremiumDay[]; worst: PremiumDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 900;
  const H = 300;
  const PAD = { top: 16, right: 16, bottom: 26, left: 56 };

  const geom = useMemo(() => {
    if (days.length === 0) return null;
    const values = days.map((d) => d.cumulativeCents);
    const lo = Math.min(0, ...values);
    const hi = Math.max(...values);
    const span = hi - lo || 1;
    const x = (i: number) =>
      PAD.left + (i / Math.max(1, days.length - 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) =>
      PAD.top + (1 - (v - lo) / span) * (H - PAD.top - PAD.bottom);

    const line = days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.cumulativeCents).toFixed(1)}`).join(' ');
    const area = `${line} L${x(days.length - 1).toFixed(1)} ${y(lo).toFixed(1)} L${x(0).toFixed(1)} ${y(lo).toFixed(1)} Z`;

    // Four ticks is enough to read a level from; more is chartjunk.
    const ticks = Array.from({ length: 4 }, (_, i) => lo + (span * i) / 3);
    // One label per year start, rather than a dense date axis.
    const yearMarks: { i: number; label: string }[] = [];
    days.forEach((d, i) => {
      const year = d.date.slice(0, 4);
      if (!yearMarks.some((m) => m.label === year)) yearMarks.push({ i, label: year });
    });
    return { x, y, line, area, ticks, yearMarks, lo };
  }, [days]);

  if (!geom) return null;
  const active = hover === null ? null : days[hover];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart-surface w-full"
        style={{ height: H }}
        role="img"
        aria-label={`Cumulative premiums from ${days[0].date} to ${days[days.length - 1].date}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          const t = (px - PAD.left) / (W - PAD.left - PAD.right);
          setHover(Math.max(0, Math.min(days.length - 1, Math.round(t * (days.length - 1)))));
        }}
      >
        {geom.ticks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left} x2={W - PAD.right} y1={geom.y(v)} y2={geom.y(v)}
              stroke="var(--grid)" strokeWidth="1"
            />
            <text
              x={PAD.left - 8} y={geom.y(v) + 4} textAnchor="end"
              className="tabular" fontSize="11" fill="var(--text-muted)"
            >
              {formatMoneyCompact(v)}
            </text>
          </g>
        ))}

        {geom.yearMarks.map((m) => (
          <text
            key={m.label} x={geom.x(m.i)} y={H - 8} textAnchor="middle"
            fontSize="11" fill="var(--text-muted)"
          >
            {m.label}
          </text>
        ))}

        <path d={geom.area} fill={UP} opacity="0.1" />
        <path d={geom.line} fill="none" stroke={UP} strokeWidth="2" strokeLinejoin="round" />

        {/* The two days that define this dataset, named on the chart rather than
            left for the reader to infer from a sudden vertical drop. */}
        {worst.slice(0, 2).map((d) => {
          const i = days.findIndex((x) => x.date === d.date);
          if (i < 0) return null;
          const cx = geom.x(i);
          const cy = geom.y(d.cumulativeCents);
          const flip = cx > W * 0.6;
          return (
            <g key={d.date}>
              <circle cx={cx} cy={cy} r="4" fill={DOWN} stroke="var(--surface-1)" strokeWidth="2" />
              <text
                x={flip ? cx - 8 : cx + 8} y={cy + 16} textAnchor={flip ? 'end' : 'start'}
                fontSize="11" fill="var(--text-secondary)"
              >
                {prettyDate(d.date)} {formatMoney(d.amountCents, { cents: false })}
              </text>
            </g>
          );
        })}

        {active && (
          <g>
            <line
              x1={geom.x(hover!)} x2={geom.x(hover!)} y1={PAD.top} y2={H - PAD.bottom}
              stroke="var(--axis)" strokeWidth="1"
            />
            <circle
              cx={geom.x(hover!)} cy={geom.y(active.cumulativeCents)} r="4"
              fill={UP} stroke="var(--surface-1)" strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {active && (
        <div className="pointer-events-none absolute left-0 top-0 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs shadow-sm">
          <div className="font-medium">{prettyDate(active.date)}</div>
          <div className="tabular mt-0.5 text-ink-secondary">
            running total {formatMoney(active.cumulativeCents, { cents: false })}
          </div>
          {active.amountCents !== 0 && (
            <div className="tabular" style={{ color: tone(active.amountCents) }}>
              that day {signed(active.amountCents)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- monthly */

function MonthlyBars({ rows }: { rows: ReturnType<typeof monthRows> }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 900;
  const H = 220;
  const PAD = { top: 12, right: 16, bottom: 30, left: 56 };
  if (rows.length === 0) return null;

  const values = rows.map((r) => r.totalCents);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const y = (v: number) => PAD.top + (1 - (v - lo) / span) * (H - PAD.top - PAD.bottom);
  const slot = (W - PAD.left - PAD.right) / rows.length;
  // A 2px gap of bare surface between bars, rather than a stroke around each.
  const barW = Math.max(3, slot - 2);
  const zero = y(0);
  const active = hover === null ? null : rows[hover];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-surface w-full" style={{ height: H }}
        role="img" aria-label="Premium total by month" onMouseLeave={() => setHover(null)}>
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
          const h = Math.max(1, Math.abs(y(r.totalCents) - zero));
          return (
            <rect
              key={r.month}
              x={PAD.left + i * slot + 1} y={top} width={barW} height={h}
              rx="2" fill={tone(r.totalCents)}
              opacity={hover === null || hover === i ? 1 : 0.45}
            />
          );
        })}

        {/* Full-height invisible strips, so a 3px bar is still easy to hit.
            A pointer-accurate target on a thin mark is a target you miss. */}
        {rows.map((r, i) => (
          <rect
            key={`hit-${r.month}`}
            x={PAD.left + i * slot} y={PAD.top}
            width={Math.max(slot, 1)} height={H - PAD.top - PAD.bottom}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {rows.map((r, i) =>
          r.month.slice(5) === '01' || i === 0 ? (
            <text key={r.month} x={PAD.left + i * slot + barW / 2} y={H - 10}
              textAnchor="middle" fontSize="11" fill="var(--text-muted)">
              {r.month.slice(5) === '01' && i > 0 ? r.month.slice(0, 4) : formatMonth(r.month)}
            </text>
          ) : null,
        )}
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs shadow-sm"
          style={{
            left: `${((PAD.left + hover! * slot + barW / 2) / W) * 100}%`,
            transform: hover! > rows.length / 2 ? 'translateX(-100%)' : 'none',
          }}
        >
          <div className="font-medium">{formatMonth(active.month)}</div>
          <div className="tabular mt-0.5" style={{ color: tone(active.totalCents) }}>
            {signed(active.totalCents, { cents: false })}
          </div>
          <div className="tabular text-ink-muted">
            {active.activeDays} active day{active.activeDays === 1 ? '' : 's'}
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- calendar */

function Calendar({
  days, year, scale,
}: { days: PremiumDay[]; year: string; scale: (c: number) => number }) {
  const cal = useMemo(() => calendarYear(days, year), [days, year]);
  const [hover, setHover] = useState<PremiumDay | null>(null);
  const CELL = 11;
  const GAP = 2;
  const LEFT = 26;
  const TOP = 16;
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  if (cal.cells.length === 0) return null;
  const W = LEFT + cal.weeks * (CELL + GAP);
  const H = TOP + 7 * (CELL + GAP);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">{year}</h3>
        {hover && (
          <span className="tabular text-xs">
            <span className="text-ink-secondary">{prettyDate(hover.date)}</span>{' '}
            <span style={{ color: tone(hover.amountCents) }}>{signed(hover.amountCents)}</span>
          </span>
        )}
      </div>
      <div className="mt-1 overflow-x-auto">
        <svg width={W} height={H} role="img" aria-label={`Daily premiums for ${year}`}>
          {cal.monthStarts.map((m) => (
            <text
              key={m.month} x={LEFT + m.week * (CELL + GAP)} y={10}
              fontSize="9" fill="var(--text-muted)"
            >
              {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][m.month - 1]}
            </text>
          ))}
          {['M', 'W', 'F'].map((label, i) => (
            <text key={label} x={0} y={TOP + (i * 2 + 1) * (CELL + GAP) + CELL - 2}
              fontSize="9" fill="var(--text-muted)">{label}</text>
          ))}
          {cal.cells.map((c) => {
            const t = scale(c.amountCents);
            const day = byDate.get(c.date)!;
            return (
              <rect
                key={c.date}
                x={LEFT + c.week * (CELL + GAP)}
                y={TOP + c.weekday * (CELL + GAP)}
                width={CELL} height={CELL} rx="2"
                fill={t === 0 ? 'var(--surface-sunken)' : t > 0 ? UP : DOWN}
                fillOpacity={t === 0 ? 1 : 0.2 + Math.abs(t) * 0.8}
                onMouseEnter={() => setHover(day)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{`${prettyDate(c.date)}: ${signed(c.amountCents)}`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- tab */

function PremiumsPanel({ premiums, tab }: { premiums: PremiumMonth[]; tab: string }) {
  const [showTable, setShowTable] = useState(false);
  const [range, setRange] = useState<Range>('all');
  const [curveRange, setCurveRange] = useState<Range>('all');

  const days = useMemo(() => premiumDays(premiums), [premiums]);
  const rows = useMemo(() => monthRows(premiums), [premiums]);
  const years = useMemo(() => yearRows(premiums), [premiums]);
  const stats = useMemo(() => premiumStats(days), [days]);
  const scale = useMemo(() => divergingScale(days), [days]);

  // Filtered AFTER the rows are built, never before. Every month keeps the
  // total and the running total it has in full history, so narrowing the range
  // changes which bars you see and not one of the numbers on them.
  const chartedRows = useMemo(() => {
    if (rows.length === 0) return rows;
    const start = rangeStart(range, rows[rows.length - 1].month, rows[0].month);
    return rows.filter((r) => r.month >= start);
  }, [rows, range]);

  // Newest first for the table — the recent months are the ones you came to
  // look at. A copy, because Array.reverse mutates in place and `rows` is what
  // the chart and every running total are read from.
  const tableRows = useMemo(() => [...rows].reverse(), [rows]);

  // Newest year first for the calendars. A copy again — `years` is what the
  // yearly figures beside the headline are read from, and reverse mutates.
  const calendarYears = useMemo(() => [...years].reverse(), [years]);

  // Same rule as the bars: trim the days that are drawn, never recompute the
  // running total over the window. Ask for 2026 alone and the curve opens at
  // the $135,933 it had actually reached by then, not at zero -- narrowing the
  // view is a request to see less, never a request to be told something else.
  const chartedDays = useMemo(() => {
    if (days.length === 0) return days;
    const start = rangeStart(curveRange, days[days.length - 1].month, days[0].month);
    return days.filter((d) => d.month >= start);
  }, [days, curveRange]);

  if (premiums.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-ink-secondary">
          Nothing on the <code className="rounded bg-sunken px-1">{tab}</code> tab yet.
          It expects a row per month labelled like{' '}
          <code className="rounded bg-sunken px-1">January, 2024</code>, with a column
          per day of the month.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="card p-6">
        <div className="text-sm text-ink-secondary">
          Net premiums since {stats.firstMonth && formatMonth(stats.firstMonth)}
        </div>
        {/* Proportional figures, not tabular — equal-width digits read loose at
            display sizes. Tabular is for columns that must line up. */}
        <div className="mt-1 text-5xl font-semibold tracking-tight">
          {formatMoney(stats.totalCents, { cents: false })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {years.map((y) => (
            <span key={y.year}>
              <span className="text-ink-muted">{y.year}</span>{' '}
              <span className="tabular font-medium" style={{ color: tone(y.totalCents) }}>
                {signed(y.totalCents, { cents: false })}
              </span>
              {y.months < 12 && (
                <span className="text-ink-muted"> ({y.months} mo)</span>
              )}
            </span>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Running total</h2>
            <p className="mt-0.5 max-w-2xl text-xs text-ink-muted">
              Every logged day
              {chartedDays.length > 0 && chartedDays[0].month !== stats.firstMonth
                ? ` from ${formatMonth(chartedDays[0].month)}`
                : ` since ${stats.firstMonth && formatMonth(stats.firstMonth)}`}
              , added up as it went. The slope is the ordinary days earning.
            </p>
          </div>
          <select
            value={curveRange}
            onChange={(e) => setCurveRange(e.target.value as Range)}
            className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm"
            aria-label="Time range for the running total"
          >
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="mt-3">
          <CumulativeCurve days={chartedDays} worst={stats.worst} />
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">By month</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              <span className="mr-3">
                <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: UP }} />
                earned
              </span>
              <span className="mr-3">
                <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: DOWN }} />
                lost
              </span>
              <span>
                {chartedRows.length} month{chartedRows.length === 1 ? '' : 's'} shown.
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
          <MonthlyBars rows={chartedRows} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold">Every day</h2>
        <p className="mt-0.5 max-w-3xl text-xs text-ink-muted">
          One square per logged day. Shade is size, capped at the 95th percentile so
          ordinary days stay visible — the two worst are far past the end of the scale
          and are named above rather than allowed to blank out everything else.
        </p>
        <div className="mt-4 space-y-5">
          {calendarYears.map((y) => (
            <Calendar key={y.year} days={days} year={y.year} scale={scale} />
          ))}
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Month by month</h2>
          <button
            onClick={() => setShowTable((v) => !v)}
            className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm"
            aria-expanded={showTable}
          >
            {showTable ? 'Hide table' : 'Show table'}
          </button>
        </div>
        {showTable && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                  <th className="py-2 pr-3 font-medium">Month</th>
                  <th className="py-2 pr-3 text-right font-medium">Total</th>
                  <th className="py-2 pr-3 text-right font-medium">Active days</th>
                  <th className="py-2 text-right font-medium">Running total</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr key={r.month} className="border-b border-hairline">
                    <td className="py-2 pr-3">{formatMonth(r.month)}</td>
                    <td className="tabular py-2 pr-3 text-right font-medium"
                      style={{ color: tone(r.totalCents) }}>
                      {signed(r.totalCents, { cents: false })}
                    </td>
                    <td className="tabular py-2 pr-3 text-right text-ink-muted">{r.activeDays}</td>
                    <td className="tabular py-2 text-right">
                      {formatMoney(r.cumulativeCents, { cents: false })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * One panel per person, behind a segmented control.
 *
 * Two people, two sheets, no shared arithmetic — the panels are genuinely
 * independent and nothing is ever summed across them. Keeping each person's
 * state inside their own panel matters: `key` on the panel forces a remount on
 * switch, so a range you picked while looking at one person doesn't silently
 * apply to the other's very differently shaped data.
 */
export interface PremiumPerson {
  key: string;
  label: string;
  tab: string;
  premiums: PremiumMonth[];
}

export default function PremiumsTab({ people }: { people: PremiumPerson[] }) {
  const [who, setWho] = useState(people[0]?.key);
  const active = people.find((p) => p.key === who) ?? people[0];
  if (!active) return null;

  return (
    <div className="space-y-6">
      {people.length > 1 && (
        <div
          className="inline-flex rounded-lg border border-hairline bg-sunken p-0.5"
          role="tablist"
          aria-label="Whose premiums"
        >
          {people.map((p) => {
            const on = p.key === active.key;
            return (
              <button
                key={p.key}
                role="tab"
                aria-selected={on}
                onClick={() => setWho(p.key)}
                className={[
                  'rounded-md px-4 py-1.5 text-sm transition-colors',
                  on ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
                ].join(' ')}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      <PremiumsPanel key={active.key} premiums={active.premiums} tab={active.tab} />
    </div>
  );
}
