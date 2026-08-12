'use client';

import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import type { MissionDay } from '@/lib/types';
import {
  missionCells, missionStatus, MISSION_BAR_CENTS, MISSION_TARGET_CENTS,
  MISSION_OPENING_BALANCE_CENTS, type MissionCell,
} from '@/lib/derive/mission';
import { formatMoney, formatPercent } from '@/lib/money';

/**
 * Four states, four treatments — and none of them rely on hue alone.
 *
 * Cleared is the filled blue; short is the orange used for losses everywhere
 * else in the app; unlogged is a hollow ring, so a day you forgot reads as an
 * absence rather than a failure; future is the faintest wash. Filled/hollow and
 * light/dark separate these even in greyscale, which matters at 8px where hue
 * is hardest to judge.
 */
function styleOf(state: string): CSSProperties {
  switch (state) {
    case 'cleared': return { background: 'var(--series-1)' };
    case 'short': return { background: 'var(--series-2)' };
    case 'unlogged': return { boxShadow: 'inset 0 0 0 1.5px var(--axis)' };
    default: return { background: 'var(--sunken)' };
  }
}

function prettyDate(date: string): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = date.split('-');
  return `${names[Number(m) - 1]} ${Number(d)}, ${y}`;
}

function Legend({ label, state, count }: { label: string; state: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={styleOf(state)} />
      <span className="tabular font-medium">{count}</span>
      <span className="text-ink-muted">{label}</span>
    </span>
  );
}

/**
 * 512 days as 512 cells, 32 to a row.
 *
 * The point of drawing every day rather than a progress bar is that the shape
 * of the effort stays visible: where the gaps clustered, how long the good runs
 * were, how much of the thing is still ahead. A bar collapses all of that into
 * one number. 32 columns because it divides 512 exactly, giving 16 clean rows
 * with no ragged tail.
 */
function DayGrid({ cells }: { cells: MissionCell[] }) {
  return (
    <div
      className="grid gap-[3px]"
      style={{ gridTemplateColumns: 'repeat(32, minmax(0, 1fr))' }}
      role="img"
      aria-label={`512 days: ${cells.filter((c) => c.state === 'cleared').length} cleared`}
    >
      {cells.map((c) => (
        <div
          key={c.date}
          className="aspect-square rounded-[2px]"
          style={styleOf(c.state)}
          title={
            c.state === 'future'
              ? `Day ${c.index} · ${prettyDate(c.date)}`
              : c.amountCents === null
                ? `Day ${c.index} · ${prettyDate(c.date)} · not logged`
                : `Day ${c.index} · ${prettyDate(c.date)} · ${formatMoney(c.amountCents)}`
          }
        />
      ))}
    </div>
  );
}

export default function MissionSection({
  mission, today,
}: {
  mission: MissionDay[];
  today: string;
}) {
  const cells = useMemo(() => missionCells(mission, today), [mission, today]);
  const s = useMemo(() => missionStatus(cells, today), [cells, today]);

  const recent = useMemo(
    () => cells.filter((c) => c.state !== 'future').slice(-14).reverse(),
    [cells],
  );

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">The mission</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-ink-muted">
            At least <span className="tabular">{formatMoney(MISSION_BAR_CENTS, { cents: false })}</span>{' '}
            a day, on {s.targetDays} days — {prettyDate(s.startDate)} to {prettyDate(s.endDate)},
            landing on {formatMoney(MISSION_TARGET_CENTS, { cents: false })}.
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-semibold tracking-tight">
            {s.daysElapsed}
            <span className="text-2xl text-ink-muted"> / {s.targetDays}</span>
          </div>
          <div className="text-xs text-ink-muted">days past</div>
        </div>
      </div>

      <div className="mt-5">
        {/* Time elapsed, not days won. This bar only ever moves forward — the
            cleared count in the legend below is what has to keep up with it. */}
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="font-medium">Days past</span>
          <span className="tabular text-ink-muted">
            {s.daysElapsed} of {s.targetDays} · {formatPercent(s.timeProgress, 1)}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full bg-series-1"
            style={{ width: `${Math.min(1, s.timeProgress) * 100}%` }} />
        </div>

        {/* The dollar goal the days add up to. Second, not first — the days are
            the promise and this is what keeping them is worth. */}
        <div className="mt-4 flex items-baseline justify-between gap-3 text-xs">
          <span className="font-medium">
            Toward {formatMoney(MISSION_TARGET_CENTS, { cents: false })}
          </span>
          <span className="tabular text-ink-muted">
            {formatMoney(s.earnedCents, { cents: false })} · {formatPercent(s.moneyProgress, 1)}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full bg-series-1" style={{ opacity: 0.55,
            width: `${Math.min(1, Math.max(0, s.moneyProgress)) * 100}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          {s.moneyAchieved ? (
            <>
              <span className="font-medium text-ink">Reached.</span>{' '}
              {formatMoney(s.earnedCents - MISSION_TARGET_CENTS, { cents: false })} past the goal.
            </>
          ) : (
            <>
              <span className="tabular font-medium text-ink">
                {formatMoney(s.moneyRemainingCents, { cents: false })}
              </span>{' '}
              still to earn by {prettyDate(s.endDate)} —{' '}
              {s.targetDays} days x {formatMoney(MISSION_BAR_CENTS, { cents: false })}.
            </>
          )}
        </p>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <Legend label="cleared" state="cleared" count={s.cleared} />
          <Legend label="short" state="short" count={s.short} />
          <Legend label="not logged" state="unlogged" count={s.unlogged} />
          <Legend label="to come" state="future" count={s.daysRemaining} />
        </div>
      </div>

      <div className="mt-5">
        <DayGrid cells={cells} />
      </div>

      <div className="mt-5 rounded-lg border border-hairline p-4">
        <p className="text-sm">
          When this mission began, <span className="font-medium">August 2026&apos;s event
          contracts balance was{' '}
          <span className="tabular">
            {formatMoney(MISSION_OPENING_BALANCE_CENTS, { cents: false })}
          </span></span>. That is the hole this started from.
        </p>
        <p className="mt-1.5 text-xs text-ink-muted">
          It is recorded here as the starting point and nothing more — the {s.targetDays}{' '}
          days and the {formatMoney(MISSION_TARGET_CENTS, { cents: false })} above are both
          counted from zero on {prettyDate(s.startDate)}, not netted against it.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="tabular text-xl font-semibold">{s.currentStreak}</div>
          <div className="text-xs text-ink-muted">
            current streak{s.longestStreak > s.currentStreak && ` · best ${s.longestStreak}`}
          </div>
        </div>
        <div>
          <div className="tabular text-xl font-semibold">{s.daysRemaining}</div>
          <div className="text-xs text-ink-muted">days left in the window</div>
        </div>
        <div>
          <div className="tabular text-xl font-semibold">
            {s.perfectStillOn ? s.targetDays : s.maxPossible}
          </div>
          <div className="text-xs text-ink-muted">
            {s.perfectStillOn ? 'clean sweep still on' : 'best finish still available'}
          </div>
        </div>
        <div>
          <div className="tabular text-xl font-semibold">
            {formatMoney(s.earnedCents, { cents: false })}
          </div>
          <div className="text-xs text-ink-muted">
            of {formatMoney(MISSION_TARGET_CENTS, { cents: false })}
            {s.bestCents !== null && ` · best day ${formatMoney(s.bestCents, { cents: false })}`}
          </div>
        </div>
      </div>

      {!s.started && (
        <p className="mt-6 rounded-lg border border-hairline p-4 text-sm text-ink-secondary">
          Starts {prettyDate(s.startDate)}. Log each day on the{' '}
          <code className="rounded bg-sunken px-1">mission</code> tab with two columns:{' '}
          <code className="rounded bg-sunken px-1">date</code> as{' '}
          <code className="rounded bg-sunken px-1">2026-08-07</code>, and{' '}
          <code className="rounded bg-sunken px-1">amount</code> for what that day earned.
        </p>
      )}

      {recent.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium">Last {recent.length} days</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                  <th className="py-1.5 pr-3 font-medium">Day</th>
                  <th className="py-1.5 pr-3 font-medium">Date</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Earned</th>
                  <th className="py-1.5 text-right font-medium">vs {formatMoney(MISSION_BAR_CENTS, { cents: false })}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.date} className="border-b border-hairline">
                    <td className="tabular py-1.5 pr-3 text-ink-muted">{c.index}</td>
                    <td className="py-1.5 pr-3">{prettyDate(c.date)}</td>
                    <td className="tabular py-1.5 pr-3 text-right font-medium">
                      {c.amountCents === null
                        ? <span className="text-ink-muted">—</span>
                        : formatMoney(c.amountCents)}
                    </td>
                    <td className="tabular py-1.5 text-right">
                      {c.amountCents === null ? (
                        <span className="text-ink-muted">not logged</span>
                      ) : (
                        <span style={{ color: c.amountCents >= MISSION_BAR_CENTS ? 'var(--series-1)' : 'var(--series-2)' }}>
                          {c.amountCents >= MISSION_BAR_CENTS ? '+' : ''}
                          {formatMoney(c.amountCents - MISSION_BAR_CENTS)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
