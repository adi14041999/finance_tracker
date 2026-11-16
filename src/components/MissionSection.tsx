'use client';

import { useMemo } from 'react';
import type { EplFixture, MissionDay, Sprint } from '@/lib/types';
import EplSection from './EplSection';
import {
  missionWeeks, currentWeek, weekSummary,
  type MissionWeek, type MissionDayCell,
} from '@/lib/derive/mission';
import {
  sprintViews, sprintsStatus, SPRINT_DAILY_CENTS,
  type LiveSprint,
} from '@/lib/derive/sprints';
import { longGameStatus, type LongGameStatus } from '@/lib/derive/longgame';
import { formatMoney, formatPercent } from '@/lib/money';
import { daysBetween } from '@/lib/dates';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The seven day labels, rotated to start on whatever day the sprint did.
 *
 * Weeks are anchored to the sprint rather than to the calendar, so the labels
 * cannot be a constant — a sprint opening on a Tuesday has Tuesday in column
 * one, and a hardcoded Mon..Sun row would quietly mislabel every day in it.
 */
function dayNamesFrom(startDate: string): string[] {
  const [y, m, d] = startDate.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS[(first + i) % 7]);
}

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
      <span className="tabular w-36 shrink-0 text-right text-xs text-ink-muted">{value}</span>
    </div>
  );
}

function prettyDate(date: string, withYear = false): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = date.split('-');
  return `${names[Number(m) - 1]} ${Number(d)}${withYear ? `, ${y}` : ''}`;
}

/** "14 days early" / "3 days late" / "bang on the estimate". */
function deltaWords(deltaDays: number): string {
  if (deltaDays === 0) return 'bang on the estimate';
  const n = Math.abs(deltaDays);
  return `${n} day${n === 1 ? '' : 's'} ${deltaDays < 0 ? 'early' : 'late'}`;
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
 *
 * A dashed rule marks the day's share of the week's goal. It is drawn across
 * every column so the seven boxes read as one plot, and it is deliberately
 * thin and grey: it is a reference, not a series, and the same neutral the
 * time bars use. The target is folded into the scale, so the line is always on
 * screen even on a week where nothing has come close to it yet — a target you
 * cannot see is not a target.
 */
function WeekDays({ days, dayNames, targetCents }: {
  days: MissionDayCell[];
  dayNames: string[];
  targetCents: number;
}) {
  const values = days.map((d) => d.amountCents ?? 0);
  const hi = Math.max(0, targetCents, ...values);
  const lo = Math.min(0, ...values);
  const span = hi - lo || 1;
  // Distance from the top of the plot to the zero line, as a percentage.
  const zeroPct = (hi / span) * 100;
  const targetPct = ((hi - targetCents) / span) * 100;
  const showTarget = targetCents > 0;

  const H = 80; // px

  return (
    <>
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

              {/* The day's share of this week's goal. Dashed so it never reads
                  as a bar edge, and drawn under the bars so a day that clears
                  it covers the line rather than being cut by it. */}
              {showTarget && (
                <div
                  className="absolute inset-x-0 border-t border-dashed"
                  style={{ top: `${targetPct}%`, borderColor: 'var(--text-muted)', opacity: 0.7 }}
                />
              )}

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

            <div className="text-[11px] text-ink-muted">{dayNames[d.dayOfWeek - 1]}</div>
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

    {showTarget && (
      /* The line needs naming once. Without it a dashed rule is just a rule,
         and the reader has to guess whether it is a target, an average or the
         edge of something. */
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span className="inline-block w-4 border-t border-dashed"
          style={{ borderColor: 'var(--text-muted)' }} />
        {formatMoney(targetCents, { cents: false })} a day — this week&apos;s goal, split seven ways
      </p>
    )}
    </>
  );
}

/**
 * Every week of the current sprint as a strip.
 *
 * One mark per week rather than per day: what matters here is the rhythm of
 * weeks kept and weeks dropped, and a sprint is short enough that the whole
 * run fits on one line. The column count follows the sprint's length so the
 * squares stay big enough to aim a cursor at — a nine-week sprint should not
 * draw nine specks across the width of the card.
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
    <div className="grid gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${Math.min(weeks.length || 1, 26)}, minmax(0, 1fr))` }}
      role="img" aria-label={`${weeks.length} weeks`}>
      {weeks.map((w) => (
        <div key={w.index} className="aspect-square rounded-[2px]" style={style(w)}
          title={`Week ${w.index} · ${prettyDate(w.startDate)}–${prettyDate(w.endDate, true)} · ${formatMoney(w.earnedCents, { cents: false })} of ${formatMoney(w.goalCents, { cents: false })}`} />
      ))}
    </div>
  );
}

/**
 * The sprint being run: what it is, how far in, and whether pace has been kept.
 *
 * Two bars rather than one. "Earned" is progress against the target; "Pace" is
 * where the standing daily rate would have you standing today. The gap between
 * them is the whole read — money ahead of pace means the estimate is going to
 * be beaten, and that is worth knowing before the sprint is over, because
 * afterwards it is just history.
 *
 * The card names the WEEKLY bar and never the daily rate. The rate chose the
 * length of the window and then stopped mattering; printing it beside the
 * window invites the reading that the rate times the weeks equals the target,
 * which it does not — the window is rounded down, so it is always a little
 * less.
 */
function CurrentSprint({ sprint }: { sprint: LiveSprint }) {
  const reached = sprint.state === 'reached';
  const ahead = sprint.aheadCents >= 0;

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">{sprint.name}</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-ink-muted">
            Sprint {sprint.index} · started {prettyDate(sprint.started, true)} ·{' '}
            {sprint.estimatedWeeks} week
            {sprint.estimatedWeeks === 1 ? '' : 's'} to{' '}
            {prettyDate(sprint.estimatedEnd, true)} ·{' '}
            <span className="tabular">
              {formatMoney(sprint.weeklyCents, { cents: false })}
            </span>/week
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-semibold tracking-tight">
            {formatMoney(sprint.earnedCents, { cents: false })}
          </div>
          <div className="text-xs text-ink-muted">
            of {formatMoney(sprint.targetCents, { cents: false })}
          </div>
        </div>
      </div>

      {reached && (
        /* The number is past the target but the sprint is not closed, because
           closing it is a decision and not a threshold. Say so plainly rather
           than either pretending it is finished or ignoring that it is done. */
        <p className="mt-4 rounded-md px-3 py-2 text-sm"
          style={{ background: 'var(--sunken)', color: 'var(--series-1)' }}>
          Target reached — log the finish date in the sprints tab to close it.
          It keeps counting until you do.
        </p>
      )}

      <div className="mt-5 space-y-2">
        <TrackBar
          label="Earned"
          kind="money"
          pct={sprint.progress}
          value={`${formatPercent(sprint.progress, 0)} of target`}
        />
        <TrackBar
          label="Pace"
          kind="time"
          pct={sprint.paceCents / sprint.targetCents}
          value={`day ${sprint.daysElapsed} of ${sprint.estimatedDays}`}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div>
          <div className="tabular text-xl font-semibold">
            {sprint.remainingCents === 0
              ? formatMoney(sprint.earnedCents - sprint.targetCents, { cents: false })
              : formatMoney(sprint.remainingCents, { cents: false })}
          </div>
          <div className="text-xs text-ink-muted">
            {sprint.remainingCents === 0 ? 'over the target' : 'still to earn'}
          </div>
        </div>
        <div>
          <div className="tabular text-xl font-semibold">{sprint.daysLeft ?? 0}</div>
          <div className="text-xs text-ink-muted">
            {sprint.daysLeft === 0 ? 'days past the estimate' : 'days to the estimate'}
          </div>
        </div>
        <div>
          <div className="tabular text-xl font-semibold"
            style={{ color: ahead ? 'var(--series-1)' : 'var(--series-2)' }}>
            {ahead ? '+' : ''}{formatMoney(sprint.aheadCents, { cents: false })}
          </div>
          <div className="text-xs text-ink-muted">
            {ahead ? 'ahead of' : 'behind'} pace
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Sprints finished, newest first, with the estimate they were measured against.
 *
 * The estimate is the point of this table. Knowing a sprint took 45 days says
 * very little; knowing it was estimated at 59 and took 45 says the thing worth
 * knowing. Actual and estimated sit next to each other so the comparison needs
 * no arithmetic.
 */
function Achieved({ done, totalEarnedCents }: { done: LiveSprint[]; totalEarnedCents: number }) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="text-base font-semibold">Achieved</h2>
        <div className="text-right">
          <span className="tabular text-xl font-semibold text-series-1">
            {formatMoney(totalEarnedCents, { cents: false })}
          </span>
          <span className="ml-2 text-xs text-ink-muted">earned across every sprint</span>
        </div>
      </div>

      {done.length === 0 ? (
        <p className="mt-3 text-sm text-ink-secondary">
          Nothing finished yet. A sprint lands here once you write its finish date
          into the sprints tab.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                <th className="py-2 pr-3 font-medium">Sprint</th>
                <th className="py-2 pr-3 text-right font-medium">Target</th>
                <th className="py-2 pr-3 text-right font-medium">Earned</th>
                <th className="py-2 pr-3 text-right font-medium">$/day</th>
                <th className="py-2 pr-3 font-medium">Started</th>
                <th className="py-2 pr-3 font-medium">Finished</th>
                <th className="py-2 pr-3 text-right font-medium">Est.</th>
                <th className="py-2 pr-3 text-right font-medium">Actual</th>
                <th className="py-2 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody>
              {done.map((d) => (
                <tr key={d.index} className="border-b border-hairline">
                  <td className="py-2 pr-3 font-medium">{d.name}</td>
                  <td className="tabular py-2 pr-3 text-right text-ink-secondary">
                    {formatMoney(d.targetCents, { cents: false })}
                  </td>
                  {/* What it actually came to, which is not always the target:
                      a sprint can be closed short, or run past. Coloured
                      against the target so the two read as a pair. */}
                  <td className="tabular py-2 pr-3 text-right font-medium"
                    style={{
                      color: d.earnedCents >= d.targetCents
                        ? 'var(--series-1)' : 'var(--series-2)',
                    }}>
                    {formatMoney(d.earnedCents, { cents: false })}
                  </td>
                  {/* The one figure comparable across sprints of different
                      sizes and lengths, and the one the $269 bar is set by. */}
                  <td className="tabular py-2 pr-3 text-right">
                    {d.dailyCents === null ? '—' : formatMoney(Math.round(d.dailyCents))}
                  </td>
                  <td className="py-2 pr-3 text-ink-secondary">{prettyDate(d.started, true)}</td>
                  <td className="py-2 pr-3">{prettyDate(d.completed!, true)}</td>
                  <td className="tabular py-2 pr-3 text-right text-ink-secondary"
                    title={`${d.estimatedWeeks} week${d.estimatedWeeks === 1 ? '' : 's'}`}>
                    {d.estimatedDays}d
                  </td>
                  <td className="tabular py-2 pr-3 text-right font-medium">{d.actualDays}d</td>
                  <td className="tabular py-2 text-right"
                    style={{
                      color: (d.deltaDays ?? 0) <= 0 ? 'var(--series-1)' : 'var(--series-2)',
                    }}>
                    {deltaWords(d.deltaDays ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * The long game: $983,000, and why that number.
 *
 * Last on the page on purpose. The sprints are where the week is decided and
 * where anything can actually be done about it; this is the line that says
 * whether the doing was worth it. Nobody needs to look at a ten-year bar every
 * morning, but it should be somewhere.
 *
 * Three figures carry the whole thing: what has been banked, where a flat $269
 * a day would have you, and where today's actual pace lands the finish. The
 * third is the only one that is a prediction, and it is labelled as one.
 */
function LongGame({ s }: { s: LongGameStatus }) {
  const ahead = s.aheadCents >= 0;
  const early = s.projectedEnd !== null && s.endDate !== null && s.projectedEnd <= s.endDate;

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">The long game</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-ink-muted">
            {s.startDate && s.endDate
              ? `${prettyDate(s.startDate, true)} – ${prettyDate(s.endDate, true)}`
              : 'starts with your first sprint'}{' '}
            · {s.totalDays.toLocaleString()} days ·{' '}
            <span className="tabular">
              {formatMoney(SPRINT_DAILY_CENTS, { cents: false })}
            </span>{' '}
            a day
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-semibold tracking-tight">
            {formatMoney(s.earnedCents, { cents: false })}
          </div>
          <div className="text-xs text-ink-muted">
            of {formatMoney(s.targetCents, { cents: false })}
          </div>
        </div>
      </div>

      {/* The reason the number is what it is. Without this the target reads as
          an arbitrary round-ish figure, and the whole point is that it is not
          arbitrary — it is what the money would have done without you. */}
      <p className="mt-4 max-w-2xl rounded-md px-3 py-2 text-sm text-ink-secondary"
        style={{ background: 'var(--sunken)' }}>
        <span className="font-medium text-ink">Why $983,000.</span> Half a million
        dollars left in an S&amp;P 500 index fund for ten years, at the index&apos;s
        long-run average of about 10.5% a year, becomes roughly $1.36m — but
        inflation takes around 3% a year, so in today&apos;s money that is nearer
        $983,000. This is the opportunity cost, not an ambition: it is what doing
        nothing with $500,000 would have earned. Clearing it means the work broke
        even against the laziest possible alternative. Spread over{' '}
        {s.totalDays.toLocaleString()} days it comes to $269.01 a day, which is
        where every sprint&apos;s size comes from.
      </p>

      {/* Both bars are labelled in DOLLARS here, not one in money and one in
          days. The time bar's fill is the pace line, and the pace line is the
          target times the fraction of the decade gone — so its value in money
          is exactly what the fill already shows. Labelling both the same way
          makes the gap between the two bars readable as a number of dollars,
          which is the one thing this section is for. */}
      <div className="mt-5 space-y-2">
        <TrackBar
          label="Earned"
          kind="money"
          pct={s.progress}
          value={`${formatMoney(s.earnedCents, { cents: false })} · ${formatPercent(s.progress, 1)}`}
        />
        <TrackBar
          label="Index line"
          kind="time"
          pct={s.timeProgress}
          value={`${formatMoney(s.paceCents, { cents: false })} · ${formatPercent(s.timeProgress, 1)}`}
        />
      </div>
      <p className="mt-2 pl-[76px] text-[11px] text-ink-muted">
        Day {s.daysElapsed.toLocaleString()} of {s.totalDays.toLocaleString()} ·
        the index line is where a flat{' '}
        {formatMoney(SPRINT_DAILY_CENTS, { cents: false })} a day would have you
        standing today.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="tabular text-xl font-semibold">
            {formatMoney(s.remainingCents, { cents: false })}
          </div>
          <div className="text-xs text-ink-muted">still to earn</div>
        </div>
        <div>
          <div className="tabular text-xl font-semibold"
            style={{ color: ahead ? 'var(--series-1)' : 'var(--series-2)' }}>
            {ahead ? '+' : ''}{formatMoney(s.aheadCents, { cents: false })}
          </div>
          <div className="text-xs text-ink-muted">
            {ahead ? 'ahead of' : 'behind'} the index line
          </div>
        </div>
        <div>
          <div className="tabular text-xl font-semibold">
            {s.requiredDailyCents === null
              ? '—'
              : formatMoney(s.requiredDailyCents, { cents: false })}
          </div>
          <div className="text-xs text-ink-muted">
            needed per day from here
          </div>
        </div>
        <div>
          <div className="tabular text-xl font-semibold"
            style={s.projectedEnd ? { color: early ? 'var(--series-1)' : 'var(--series-2)' } : undefined}>
            {s.projectedEnd === null ? '—' : prettyDate(s.projectedEnd, true)}
          </div>
          <div className="text-xs text-ink-muted">
            {/* Named a projection rather than a date, because that is what it
                is: today's average, extended. It moves every day. */}
            {s.projectedEnd === null ? 'nothing to project from yet' : 'finish at this pace'}
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-ink-muted">
        Counts what every sprint earned, finished and running.
      </p>
    </section>
  );
}

export default function MissionSection({
  mission, sprints, epl, today,
}: {
  mission: MissionDay[];
  sprints: Sprint[];
  epl: EplFixture[];
  today: string;
}) {
  const status = useMemo(
    () => sprintsStatus(sprintViews(sprints, mission, today)),
    [sprints, mission, today],
  );
  const sprint = status.current;
  const longGame = useMemo(
    () => longGameStatus(status.totalEarnedCents, today, status.firstStarted),
    [status.totalEarnedCents, today, status.firstStarted],
  );

  const weeks = useMemo(
    () => missionWeeks(mission, today, sprint),
    [mission, today, sprint],
  );
  const summary = useMemo(() => weekSummary(weeks, sprint), [weeks, sprint]);

  const dayNames = useMemo(
    () => dayNamesFrom(sprint ? sprint.started : today),
    [sprint, today],
  );

  const pending = !!sprint && today < sprint.started;

  // Before a sprint opens there is no current week, but week one's goal is
  // already settled — so show it as a preview rather than a placeholder. Zero
  // days elapsed, seven to come, nothing earned: the week exactly as it will be
  // handed over on the first day.
  const week = useMemo(() => {
    const live = currentWeek(weeks, today);
    if (live) return live;
    const first = weeks[0];
    if (!first || !pending) return null;
    return { ...first, daysElapsed: 0, daysLeft: first.dayCount, timeProgress: 0 };
  }, [weeks, today, pending]);

  const daysUntilStart = useMemo(
    () => (pending && sprint ? daysBetween(today, sprint.started) : 0),
    [pending, today, sprint],
  );

  const closed = useMemo(
    () => weeks.filter((w) => w.state === 'met' || w.state === 'missed').slice(-8).reverse(),
    [weeks],
  );

  // No sprint at all is a real state, not an error: the ladder has run out, or
  // none has been written down yet. Say what to do about it rather than
  // rendering a card full of zeroes.
  if (!sprint) {
    return (
      <div className="space-y-8">
        <section className="card p-6">
          <h2 className="text-base font-semibold">No sprint running</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
            {status.completedCount > 0
              ? `${status.completedCount} sprint${status.completedCount === 1 ? '' : 's'} finished and nothing queued behind them. Add a row to the sprints tab — a name and an amount is enough, since it starts the day after the last one finished.`
              : 'Add a row to the sprints tab — a name, an amount and the day it starts — and the weekly goals build themselves from it. After the first, the start date can be left blank and it chains on from the one above.'}
          </p>
        </section>
        <Achieved done={status.done} totalEarnedCents={status.totalEarnedCents} />
        <EplSection epl={epl} />
        <LongGame s={longGame} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* THIS WEEK — the thing you can act on today, so it leads. */}
      {week && (
        <section className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">
                {pending ? 'Week one' : 'This week'} · {prettyDate(week.startDate)} –{' '}
                {prettyDate(week.endDate)}
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Week {week.index} of {summary.totalWeeks} · {dayNames[0]} to {dayNames[6]}
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
            <WeekDays days={week.days} dayNames={dayNames} targetCents={week.perDayCents} />
          </div>
        </section>
      )}

      {/* THE SPRINT — the thing the week is a slice of. */}
      <CurrentSprint sprint={sprint} />

      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-base font-semibold">Weeks of this sprint</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-1)' }} />
              met ({summary.weeksMet})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-2)' }} />
              missed ({summary.weeksMissed})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-hairline"
                style={{ background: 'var(--sunken)' }} />
              not started
            </span>
          </div>
        </div>
        <div className="mt-4">
          <WeekStrip weeks={weeks} />
        </div>
        {summary.weeklyPaceCents !== null && (
          <p className="mt-3 text-[11px] text-ink-muted">
            {formatMoney(summary.weeklyPaceCents, { cents: false })} a week from here to finish on
            the estimate.
          </p>
        )}
      </section>

      <Achieved done={status.done} totalEarnedCents={status.totalEarnedCents} />

      <EplSection epl={epl} />

      {closed.length > 0 && (
        <section className="card p-5">
          <h2 className="text-base font-semibold">Weeks so far</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                  <th className="py-2 pr-3 font-medium">Week</th>
                  <th className="py-2 pr-3 font-medium">{dayNames[0]} – {dayNames[6]}</th>
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

      {/* Last, because it is the slowest-moving thing on the page and the only
          one nothing can be done about today. */}
      <LongGame s={longGame} />
    </div>
  );
}
