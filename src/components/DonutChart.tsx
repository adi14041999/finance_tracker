'use client';

import { useMemo, useState } from 'react';
import { arcPath } from '@/lib/chart';
import { formatMoney, formatPercent } from '@/lib/money';

export interface Slice {
  key: string;
  label: string;
  valueCents: number;
}

/**
 * Part-to-whole, at a glance.
 *
 * Capped at six segments — beyond that, adjacent slices blur into each other and
 * the eye can't rank them, so anything past the top five folds into "Other".
 * The full ranking lives in the legend beside it, which is also what makes the
 * chart legible without relying on colour: three of the six light-mode fills sit
 * below 3:1 contrast against the surface, so the labels are doing real work, not
 * decoration.
 *
 * The palette is the validated categorical order, assigned by rank and never
 * cycled. A 2px surface-coloured stroke on each segment gives the gap that keeps
 * neighbouring fills from reading as one shape.
 */
const COLORS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
];

const MAX_SLICES = 6;
const SIZE = 200;
const OUTER = 92;
const INNER = 58;

export default function DonutChart({
  slices,
  centreLabel = 'Total',
}: {
  slices: Slice[];
  centreLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const { shown, total } = useMemo(() => {
    const positive = slices
      .filter((s) => s.valueCents > 0)
      .sort((a, b) => b.valueCents - a.valueCents);

    if (positive.length <= MAX_SLICES) {
      return { shown: positive, total: positive.reduce((a, s) => a + s.valueCents, 0) };
    }

    const head = positive.slice(0, MAX_SLICES - 1);
    const tail = positive.slice(MAX_SLICES - 1);
    const other: Slice = {
      key: '__other',
      label: `Other (${tail.length})`,
      valueCents: tail.reduce((a, s) => a + s.valueCents, 0),
    };
    const all = [...head, other];
    return { shown: all, total: all.reduce((a, s) => a + s.valueCents, 0) };
  }, [slices]);

  if (shown.length === 0 || total === 0) {
    return <p className="py-10 text-center text-sm text-ink-muted">Nothing to show yet.</p>;
  }

  // Cumulative angles, clockwise from 12 o'clock.
  let angle = 0;
  const arcs = shown.map((slice, i) => {
    const sweep = (slice.valueCents / total) * Math.PI * 2;
    const d = arcPath(SIZE / 2, SIZE / 2, OUTER, INNER, angle, angle + sweep);
    angle += sweep;
    return { d, slice, color: COLORS[i], share: slice.valueCents / total };
  });

  const active = hover != null ? arcs[hover] : null;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-[200px] w-[200px] shrink-0"
        role="img"
        aria-label={`Spending by category: ${arcs
          .map((a) => `${a.slice.label} ${formatPercent(a.share)}`)
          .join(', ')}`}
      >
        {arcs.map((arc, i) => (
          <path
            key={arc.slice.key}
            d={arc.d}
            fill={arc.color}
            stroke="var(--surface-1)"
            strokeWidth="2"
            opacity={hover == null || hover === i ? 1 : 0.35}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            style={{ transition: 'opacity 120ms' }}
          />
        ))}

        {/* Centre reads the hovered slice, or the total when nothing is hovered. */}
        <text
          x={SIZE / 2}
          y={SIZE / 2 - 6}
          textAnchor="middle"
          className="tabular"
          fontSize="17"
          fontWeight="600"
          fill="var(--text-primary)"
        >
          {formatMoney(active ? active.slice.valueCents : total, { cents: false })}
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 12}
          textAnchor="middle"
          fontSize="10"
          fill="var(--text-muted)"
        >
          {active ? truncate(active.slice.label, 18) : centreLabel}
        </text>
      </svg>

      <ul className="w-full min-w-0 space-y-1.5">
        {arcs.map((arc, i) => (
          <li
            key={arc.slice.key}
            className="flex items-baseline gap-2 text-sm"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <span
              aria-hidden
              className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ background: arc.color }}
            />
            <span className="min-w-0 flex-1 truncate">{arc.slice.label}</span>
            <span className="tabular shrink-0 text-ink-secondary">
              {formatMoney(arc.slice.valueCents, { cents: false })}
            </span>
            <span className="tabular w-10 shrink-0 text-right text-ink-muted">
              {formatPercent(arc.share)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
