'use client';

import { useMemo } from 'react';
import type { EplFixture } from '@/lib/types';
import {
  eplRows, eplStatus, eplMonths, EPL_PER_GAME_CENTS,
  type EplRow, type EplMonth,
} from '@/lib/derive/epl';
import { formatMoney, formatPercent } from '@/lib/money';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function prettyMonth(month: string | null): string {
  if (month === null) return 'No date yet';
  const [y, m] = month.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function prettyDate(date: string, withYear = false): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = date.split('-');
  return `${names[Number(m) - 1]} ${Number(d)}${withYear ? `, ${y}` : ''}`;
}

/**
 * Same two-track layout as the mission cards — money in the series colour,
 * the clock in neutral grey, identical geometry so the gap between the fills
 * reads as pace without arithmetic.
 *
 * The only difference is what the clock measures. Here it is GAMES PLAYED, not
 * days: an international break is a fortnight with no fixtures in it, and a
 * date-based bar would call that falling behind when there was nothing there
 * to earn from.
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
      <span className="tabular w-32 shrink-0 text-right text-xs text-ink-muted">{value}</span>
    </div>
  );
}

/**
 * All 380 fixtures as a strip, 38 to a row — one row per matchweek, which is
 * how the season is actually organised.
 *
 * Now that the sheet holds a row per fixture, each cell can carry that game's
 * own result rather than just "played or not": blue cleared the $50, orange
 * fell short, grey is still to come. Hover names the fixture and the figure.
 *
 * Cells beyond the fixtures listed are drawn anyway, so the shape of a full
 * season is visible even before the list is finished.
 */
function SeasonStrip({ rows, total }: { rows: EplRow[]; total: number }) {
  const style = (r: EplRow | undefined) => {
    switch (r?.state) {
      case 'cleared': return { background: 'var(--series-1)' };
      case 'short': return { background: 'var(--series-2)' };
      default: return { background: 'var(--sunken)' };
    }
  };
  return (
    <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(38, minmax(0, 1fr))' }}
      role="img"
      aria-label={`${rows.filter((r) => r.state !== 'unplayed').length} of ${total} games played`}>
      {Array.from({ length: total }, (_, i) => {
        const r = rows[i];
        return (
          <div
            key={i}
            className="aspect-square rounded-[1px]"
            style={style(r)}
            title={
              !r
                ? `Game ${i + 1}`
                : r.amountCents === null
                  ? `${r.fixture}${r.date ? ` · ${prettyDate(r.date, true)}` : ''} · not played`
                  : `${r.fixture}${r.date ? ` · ${prettyDate(r.date, true)}` : ''} · ${formatMoney(r.amountCents)}`
            }
          />
        );
      })}
    </div>
  );
}

/**
 * One month, collapsed to a summary line until you want the fixtures.
 *
 * A native <details>, so it works without JavaScript, keeps its own state, and
 * is reachable by keyboard for free. Ten months of twenty-odd fixtures is 380
 * rows — far too many to have open at once, and far too useful to omit.
 *
 * The summary carries enough to make opening it a choice rather than a
 * necessity: how many played, what they brought, and whether the month is
 * ahead of the bar.
 */
function MonthGroup({ month: m, openByDefault }: { month: EplMonth; openByDefault: boolean }) {
  const ahead = m.aheadCents >= 0;
  return (
    <details open={openByDefault} className="rounded-lg border border-hairline">
      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
        <span className="font-medium">{prettyMonth(m.month)}</span>
        <span className="tabular flex flex-wrap gap-x-4 text-xs text-ink-muted">
          <span>{m.played} of {m.fixtures.length} played</span>
          <span className="font-medium text-ink">
            {formatMoney(m.earnedCents, { cents: false })}
          </span>
          {m.played > 0 && (
            <span style={{ color: ahead ? 'var(--series-1)' : 'var(--series-2)' }}>
              {ahead ? '+' : ''}{formatMoney(m.aheadCents, { cents: false })}
            </span>
          )}
        </span>
      </summary>

      <div className="overflow-x-auto border-t border-hairline px-4 pb-3 pt-1">
        <table className="w-full text-sm">
          <tbody>
            {m.fixtures.map((f) => (
              <tr key={f.row} className="border-b border-hairline last:border-0">
                <td className="tabular py-1.5 pr-3 text-xs text-ink-muted">{f.index}</td>
                <td className="py-1.5 pr-3">{f.fixture}</td>
                <td className="py-1.5 pr-3 text-xs text-ink-muted">
                  {f.date ? prettyDate(f.date) : '—'}
                </td>
                <td className="tabular py-1.5 pr-3 text-right font-medium">
                  {f.amountCents === null
                    ? <span className="font-normal text-ink-muted">not played</span>
                    : formatMoney(f.amountCents)}
                </td>
                <td className="tabular w-20 py-1.5 text-right text-xs"
                  style={{
                    color: f.deltaCents === null
                      ? 'var(--text-muted)'
                      : f.deltaCents >= 0 ? 'var(--series-1)' : 'var(--series-2)',
                  }}>
                  {f.deltaCents === null
                    ? ''
                    : `${f.deltaCents >= 0 ? '+' : ''}${formatMoney(f.deltaCents)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function EplSection({ epl }: { epl: EplFixture[] }) {
  const rows = useMemo(() => eplRows(epl), [epl]);
  const s = useMemo(() => eplStatus(rows), [rows]);
  const months = useMemo(() => eplMonths(rows), [rows]);

  // Open the month the next unplayed fixture sits in — the one you are most
  // likely to be filling in. Everything else starts collapsed.
  const openMonth = useMemo(
    () => s.next?.date?.slice(0, 7) ?? months[0]?.month ?? null,
    [s.next, months],
  );

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">The Premier League season</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-ink-muted">
            <span className="tabular">{formatMoney(EPL_PER_GAME_CENTS, { cents: false })}</span>{' '}
            a game, every game of {s.season} — {s.totalGames} fixtures,{' '}
            {formatMoney(s.targetCents, { cents: false })}. The season is the clock here,
            not the calendar: a break with no fixtures in it costs you nothing.
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

      <div className="mt-5 space-y-2">
        <TrackBar
          label="Earned"
          kind="money"
          pct={s.moneyProgress}
          value={`${formatPercent(s.moneyProgress, 1)} banked`}
        />
        <TrackBar
          label="Season"
          kind="time"
          pct={s.seasonProgress}
          value={`${s.played} of ${s.totalGames} games`}
        />
      </div>

      {s.started ? (
        <p className="mt-3 text-xs text-ink-muted">
          {s.onTrack ? (
            <>
              <span className="tabular font-medium" style={{ color: 'var(--series-1)' }}>
                {formatMoney(s.aheadCents, { cents: false })} ahead
              </span>{' '}
              of the {formatMoney(EPL_PER_GAME_CENTS, { cents: false })} bar across{' '}
              {s.played} games
            </>
          ) : (
            <>
              <span className="tabular font-medium" style={{ color: 'var(--series-2)' }}>
                {formatMoney(-s.aheadCents, { cents: false })} behind
              </span>{' '}
              the {formatMoney(EPL_PER_GAME_CENTS, { cents: false })} bar across{' '}
              {s.played} games
            </>
          )}
          {' · '}
          {formatMoney(s.expectedCents, { cents: false })} was due by now.
        </p>
      ) : (
        <p className="mt-3 text-xs text-ink-muted">
          Nothing logged yet. The <code className="rounded bg-sunken px-1">epl</code> tab
          takes one row per fixture, all {s.totalGames} of them:{' '}
          <code className="rounded bg-sunken px-1">fixture</code>, an optional{' '}
          <code className="rounded bg-sunken px-1">date</code>, and{' '}
          <code className="rounded bg-sunken px-1">amount</code> once it is played.
          {s.listed > 0 && s.listed < s.totalGames && (
            <> {s.listed} listed so far.</>
          )}
        </p>
      )}

      <div className="mt-5">
        <SeasonStrip rows={rows} total={s.totalGames} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="tabular text-xl font-semibold">
            {s.averagePerGameCents === null
              ? '—'
              : formatMoney(s.averagePerGameCents, { cents: false })}
          </div>
          <div className="text-xs text-ink-muted">average per game so far</div>
        </div>
        <div>
          <div className="tabular text-xl font-semibold">
            {s.neededPerGameCents === null
              ? '—'
              : formatMoney(s.neededPerGameCents, { cents: false })}
          </div>
          <div className="text-xs text-ink-muted">needed from each game left</div>
        </div>
        <div>
          <div className="tabular text-xl font-semibold">
            <span style={{ color: 'var(--series-1)' }}>{s.cleared}</span>
            <span className="text-ink-muted"> / {s.short}</span>
          </div>
          <div className="text-xs text-ink-muted">
            cleared / short · {s.gamesLeft} still to play
          </div>
        </div>
        <div>
          <div className="tabular text-xl font-semibold">
            {formatMoney(s.remainingCents, { cents: false })}
          </div>
          <div className="text-xs text-ink-muted">still to earn</div>
        </div>
      </div>

      {months.length > 0 && (
        <div className="mt-6 space-y-2">
          <h3 className="text-sm font-medium">Fixtures by month</h3>
          {months.map((m) => (
            <MonthGroup key={m.month ?? 'undated'} month={m} openByDefault={m.month === openMonth} />
          ))}
        </div>
      )}

    </section>
  );
}
