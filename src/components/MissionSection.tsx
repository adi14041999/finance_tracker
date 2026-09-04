'use client';

import { useMemo } from 'react';
import type { EplFixture, MissionDay } from '@/lib/types';
import EplSection from './EplSection';
import {
  missionWeeks, currentWeek, missionStatus,
  MISSION_TARGET_CENTS, MISSION_DAILY_CENTS,
  type MissionWeek, type MissionDayCell,
} from '@/lib/derive/mission';
import { formatMoney, formatPercent } from '@/lib/money';
import { daysBetween } from '@/lib/dates';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * One labelled track.
 *
 * Money and time were previously the same blue at different opacities, which
 * is not a distinction anyone should have to work out — opacity alone is the
 * weakest channel there is, and it fails outright in greyscale. Now money is
 * the series colour and time is neutral grey, each with its name at the left
 * and its figure at the right.
 *
 * The bars keep identical geometry and a shared left origin, because the gap
 * between the two fills is the pace read and any difference in height or
 * width would turn that glance back into arithmetic.
 */
function TrackBar({
  label, pct, value, kind,
}: {
  label: string;
  pct: number;
  value: string;
  kind: 'money' | 'time';
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs font-medium">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-sunken">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(1, Math.max(0, pct)) * 100}%`,
            background: kind === 'money' ? 'var(--series-1)' : 'var(--text-muted)',
          }}
        />
      </div>
      <span className="tabular w-28 shrink-0 text-right text-xs text-ink-muted">{value}</span>
    </div>
  );
}

function prettyDate(date: string, withYear = false): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = date.split('-');
  return `${names[Number(m) - 1]} ${Number(d)}${withYear ? `, ${y}` : ''}`;
}

/**
 * The seven days of the current week, diverging around a zero axis.
 *
 * Bars rather than squares, because within one week the question is not "did it
 * clear a bar" but "how much did each day bring". Height carries that; a square
 * could not.
 *
 * A losing day now hangs BELOW the axis in the loss colour rather than drawing
 * nothing. Clamping it to zero was the worst of both worlds: it looked exactly
 * like a day that earned nothing, when it is the opposite — a day that went
 * backwards and made the rest of the week harder.
 *
 * The axis floats rather than sitting at the midpoint. It is placed at the
 * position zero actually occupies in the week's range, so a week of small
 * losses and one big win does not draw the losses half a card tall.
 */
function WeekDays({ days }: { days: MissionDayCell[] }) {
  const values = days.map((d) => d.amountCents ?? 0);
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const span = hi - lo || 1;
  // Distance from the top of the plot to the zero line, as a percentage.
  const zeroPct = (hi / span) * 100;

  const H = 80; // px

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const v = d.amountCents;
        const magnitude = v === null || v === 0 ? 0 : (Math.abs(v) / span) * 100;
        // A tiny day still deserves a visible mark, but never one that crosses
        // the axis and reads as the wrong sign.
        const barPct = magnitude === 0 ? 0 : Math.max(2, magnitude);
        const negative = v !== null && v < 0;

        return (
          <div key={d.date} className="flex flex-col items-center gap-1.5">
            <div className="relative w-full rounded bg-sunken" style={{ height: H }}>
              {/* The axis, drawn on every day so the row reads as one plot. */}
              <div
                className="absolute inset-x-0 border-t"
                style={{ top: `${zeroPct}%`, borderColor: 'var(--axis)' }}
              />

              {d.state === 'earned' && v !== null && v !== 0 && (
                <div
                  className="absolute inset-x-0"
                  style={{
                    height: `${barPct}%`,
                    ...(negative
                      ? { top: `${zeroPct}%`, borderRadius: '0 0 3px 3px' }
                      : { bottom: `${100 - zeroPct}%`, borderRadius: '3px 3px 0 0' }),
                    background: negative ? 'var(--series-2)' : 'var(--series-1)',
                  }}
                />
              )}

              {/* A logged zero and a day you never wrote down are different
                  facts, so they get different marks rather than both reading
                  as empty. Both sit on the axis, which is where they belong. */}
              {(d.state === 'blank' || (d.state === 'earned' && v === 0)) && (
                <div
                  className="absolute left-1/2 h-0.5 w-3 -translate-x-1/2 -translate-y-1/2 rounded bg-axis"
                  style={{ top: `${zeroPct}%` }}
                />
              )}
              {d.state === 'unlogged' && (
                <div
                  className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-axis"
                  style={{ top: `${zeroPct}%` }}
                />
              )}
            </div>

            <div className="text-[11px] text-ink-muted">{DAY_NAMES[d.dayOfWeek - 1]}</div>
            <div
              className="tabular text-[11px]"
              style={negative ? { color: 'var(--series-2)' } : undefined}
            >
              {d.amountCents === null
                ? <span className="text-ink-muted">—</span>
                : formatMoney(d.amountCents, { cents: false })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * All 176 weeks as a strip.
 *
 * One mark per week rather than per day: across three and a half years a day
 * is noise, and what matters is the rhythm of weeks kept and weeks dropped.
 * 44 columns gives four clean rows of eleven months each.
 */
function WeekStrip({ weeks }: { weeks: MissionWeek[] }) {
  const style = (w: MissionWeek) => {
    switch (w.state) {
      case 'met': return { background: 'var(--series-1)' };
      case 'missed': return { background: 'var(--series-2)' };
      case 'current': return { boxShadow: 'inset 0 0 0 2px var(--series-1)' };
      default: return { background: 'var(--sunken)' };
    }
  };
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(44, minmax(0, 1fr))' }}
      role="img" aria-label={`${weeks.length} weeks`}>
      {weeks.map((w) => (
        <div key={w.index} className="aspect-square rounded-[2px]" style={style(w)}
          title={`Week ${w.index} · ${prettyDate(w.startDate)}–${prettyDate(w.endDate, true)} · ${formatMoney(w.earnedCents, { cents: false })} of ${formatMoney(w.goalCents, { cents: false })}`} />
      ))}
    </div>
  );
}

export default function MissionSection({
  mission, epl, today,
}: {
  mission: MissionDay[];
  epl: EplFixture[];
  today: string;
}) {
  const weeks = useMemo(() => missionWeeks(mission, today), [mission, today]);
  const s = useMemo(() => missionStatus(weeks, today), [weeks, today]);

  // Before the mission opens there is no current week, but week one's goal is
  // already settled — so show it as a preview rather than a placeholder. Zero
  // days elapsed, seven to come, nothing earned: the week exactly as it will be
  // handed over on the Monday.
  const week = useMemo(() => {
    const live = currentWeek(weeks, today);
    if (live) return live;
    if (s.started) return null; // finished, not pending
    const first = weeks[0];
    return {
      ...first,
      daysElapsed: 0,
      daysLeft: first.dayCount,
      timeProgress: 0,
    };
  }, [weeks, today, s.started]);

  const pending = !s.started;
  const daysUntilStart = useMemo(
    () => (pending ? daysBetween(today, s.startDate) : 0),
    [pending, today, s.startDate],
  );

  const closed = useMemo(
    () => weeks.filter((w) => w.state === 'met' || w.state === 'missed').slice(-8).reverse(),
    [weeks],
  );

  return (
    <div className="space-y-8">
      {/* THIS WEEK — the thing you can actually act on today, so it leads. */}
      <section className="card p-6">
        {week ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">
                  {pending ? 'Week one' : 'This week'} · {prettyDate(week.startDate)} –{' '}
                  {prettyDate(week.endDate)}
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Week {week.index} of {s.totalWeeks} · Monday to Sunday
                  {pending && (
                    <>
                      {' · '}
                      <span className="font-medium text-ink">
                        starts in {daysUntilStart} day{daysUntilStart === 1 ? '' : 's'}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="text-right">
                <div className="text-4xl font-semibold tracking-tight">
                  {formatMoney(week.goalCents, { cents: false })}
                </div>
                <div className="text-xs text-ink-muted">
                  this week&apos;s goal ·{' '}
                  <span className="tabular">{formatMoney(week.perDayCents, { cents: false })}</span>/day
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <TrackBar
                label="Earned"
                kind="money"
                pct={week.progress ?? 0}
                value={`${formatPercent(week.progress ?? 0, 0)} of goal`}
              />
              <TrackBar
                label="Week"
                kind="time"
                pct={week.timeProgress}
                value={pending ? 'not started' : `day ${week.daysElapsed} of ${week.dayCount}`}
              />
            </div>

            <div className="mt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
                <div>
                  <span className="tabular text-xl font-semibold text-series-1">
                    {formatMoney(week.earnedCents, { cents: false })}
                  </span>
                  {/* The percentage lives on the bar labels above; repeating it
                      here would be the same fact twice, six lines apart. */}
                  <div className="mt-0.5 text-xs text-ink-muted">earned so far</div>
                </div>
                <div className="text-right">
                  {week.remainingCents === 0 ? (
                    <>
                      <span className="tabular text-xl font-semibold text-series-1">Done</span>
                      <div className="mt-0.5 text-xs text-ink-muted">
                        {formatMoney(week.earnedCents - week.goalCents, { cents: false })} over
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="tabular text-xl font-semibold">
                        {formatMoney(week.remainingCents, { cents: false })}
                      </span>
                      <div className="mt-0.5 text-xs text-ink-muted">
                        {pending ? 'to earn' : 'still to go'} · {week.daysLeft} day
                        {week.daysLeft === 1 ? '' : 's'}{pending ? '' : ' left'}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <WeekDays days={week.days} />
            </div>
          </>
        ) : (
          <div>
            <h2 className="text-base font-semibold">
              {s.started ? 'The mission has finished' : 'The mission starts Mon 17 Aug 2026'}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
              {s.started
                ? `It ran to ${prettyDate(s.endDate, true)}.`
                : 'Weekly goals run Monday to Sunday, and each one is set from whatever is left of the target when it begins.'}
            </p>
          </div>
        )}
      </section>

      {/* THE LONG GAME — fixed, and the reason the weekly number moves. */}
      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">The long game</h2>
            <p className="mt-0.5 max-w-2xl text-xs text-ink-muted">
              <span className="tabular">{formatMoney(MISSION_DAILY_CENTS, { cents: false })}</span>{' '}
              a day from {prettyDate(s.startDate, true)} to {prettyDate(s.endDate, true)} —{' '}
              {s.totalWeeks * 7} days, {formatMoney(MISSION_TARGET_CENTS, { cents: false })}.
              Fixed. Each week&apos;s goal is whatever is left of it, spread over the days
              left to earn it — beat a week and next week eases, miss one and it steepens.
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-semibold tracking-tight">
              {formatMoney(s.earnedCents, { cents: false })}
            </div>
            <div className="text-xs text-ink-muted">
              of {formatMoney(MISSION_TARGET_CENTS, { cents: false })}
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <TrackBar
            label="Earned"
            kind="money"
            pct={s.progress}
            value={`${formatPercent(s.progress, 1)} banked`}
          />
          <TrackBar
            label="Time"
            kind="time"
            pct={s.timeProgress}
            value={`day ${s.daysElapsed} of ${s.totalWeeks * 7}`}
          />
          <p className="pl-[76px] text-[11px] text-ink-muted">
            {formatMoney(s.remainingCents, { cents: false })} still to earn in the{' '}
            {s.totalWeeks * 7 - s.daysElapsed} days left.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="tabular text-xl font-semibold">
              {s.weeklyPaceCents === null ? '—' : formatMoney(s.weeklyPaceCents, { cents: false })}
            </div>
            <div className="text-xs text-ink-muted">
              needed per week from here
              {s.weeklyPaceCents !== null && s.weeklyPaceCents !== s.openingWeeklyCents && (
                <> · opened at {formatMoney(s.openingWeeklyCents, { cents: false })}</>
              )}
            </div>
          </div>
          <div>
            <div className="tabular text-xl font-semibold">{s.weeksRemaining}</div>
            <div className="text-xs text-ink-muted">weeks left of {s.totalWeeks}</div>
          </div>
          <div>
            <div className="tabular text-xl font-semibold text-series-1">{s.weeksMet}</div>
            <div className="text-xs text-ink-muted">weeks hit</div>
          </div>
          <div>
            <div className="tabular text-xl font-semibold">{s.weeksMissed}</div>
            <div className="text-xs text-ink-muted">weeks missed</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-1)' }} />
              hit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-2)' }} />
              missed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm"
                style={{ boxShadow: 'inset 0 0 0 2px var(--series-1)' }} />
              this week
            </span>
            {/* "not started" rather than "to come": the line above this talks
                about dollars still to earn, and "to come" borrowed that
                vocabulary for something entirely different — a week that has
                not begun. */}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-hairline"
                style={{ background: 'var(--sunken)' }} />
              not started
            </span>
          </div>
          <WeekStrip weeks={weeks} />
        </div>
      </section>

      <EplSection epl={epl} />

      {closed.length > 0 && (
        <section className="card p-5">
          <h2 className="text-base font-semibold">Weeks so far</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                  <th className="py-2 pr-3 font-medium">Week</th>
                  <th className="py-2 pr-3 font-medium">Mon – Sun</th>
                  <th className="py-2 pr-3 text-right font-medium">Goal</th>
                  <th className="py-2 pr-3 text-right font-medium">Earned</th>
                  <th className="py-2 text-right font-medium">Over / under</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((w) => {
                  const delta = w.earnedCents - w.goalCents;
                  return (
                    <tr key={w.index} className="border-b border-hairline">
                      <td className="tabular py-2 pr-3 text-ink-muted">{w.index}</td>
                      <td className="py-2 pr-3">
                        {prettyDate(w.startDate)} – {prettyDate(w.endDate, true)}
                      </td>
                      <td className="tabular py-2 pr-3 text-right text-ink-secondary">
                        {formatMoney(w.goalCents, { cents: false })}
                      </td>
                      <td className="tabular py-2 pr-3 text-right font-medium">
                        {formatMoney(w.earnedCents, { cents: false })}
                      </td>
                      <td className="tabular py-2 text-right"
                        style={{ color: delta >= 0 ? 'var(--series-1)' : 'var(--series-2)' }}>
                        {delta >= 0 ? '+' : ''}{formatMoney(delta, { cents: false })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
