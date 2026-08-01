'use client';

import { useId, useRef, useState } from 'react';
import {
  linearScale, bandCentres, niceDomain, linePath, areaPath,
  nearestIndex, labelStride,
} from '@/lib/chart';
import { formatMoneyCompact, formatMoney } from '@/lib/money';
import { formatMonthShort, formatMonth } from '@/lib/dates';

export interface Series {
  key: string;
  label: string;
  /** cents; null renders a gap in the line rather than a false zero */
  values: (number | null)[];
  color: string;
  /** SVG dash pattern. A second channel besides colour, so overlapping lines
   *  stay tellable apart in greyscale and for colour-blind readers. */
  dash?: string;
  area?: boolean;
}

interface Props {
  months: string[];
  series: Series[];
  height?: number;
  /** false lets the axis start above zero; only for series that never cross it */
  includeZero?: boolean;
}

const PAD = { top: 12, right: 16, bottom: 26, left: 52 };

/**
 * Line chart with a crosshair and tooltip.
 *
 * Straight segments, not splines: a curve through monthly points implies
 * values between them that were never measured.
 */
export default function LineChart({
  months, series, height = 240, includeZero = true,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId();

  const width = 720; // viewBox units; the SVG scales to its container
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const { domain, ticks } = niceDomain(all.length ? all : [0], { includeZero });

  const x = bandCentres(months.length, [PAD.left, PAD.left + innerW]);
  const y = linearScale(domain, [PAD.top + innerH, PAD.top]);
  const stride = labelStride(months.length, innerW, 46);

  function pointsFor(s: Series) {
    return s.values
      .map((v, i) => (v == null ? null : { x: x[i], y: y(v) }))
      .filter((p): p is { x: number; y: number } => p != null);
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Map screen px back into viewBox units, since the SVG is scaled.
    const vx = ((e.clientX - rect.left) / rect.width) * width;
    setHover(nearestIndex(x, vx));
  }

  const multi = series.length > 1;

  return (
    <div className="relative">
      {multi && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <svg width="14" height="8" aria-hidden>
                <line
                  x1="0" y1="4" x2="14" y2="4"
                  stroke={s.color} strokeWidth="2"
                  strokeDasharray={s.dash}
                />
              </svg>
              {s.label}
            </span>
          ))}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="chart-surface w-full"
        style={{ height }}
        role="img"
        aria-label={
          months.length
            ? `${series.map((s) => s.label).join(' and ')}, ${formatMonth(months[0])} to ${formatMonth(months[months.length - 1])}`
            : 'No data'
        }
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
          </clipPath>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left} x2={PAD.left + innerW}
              y1={y(t)} y2={y(t)}
              stroke="var(--grid)" strokeWidth="1"
            />
            <text
              x={PAD.left - 8} y={y(t)}
              textAnchor="end" dominantBaseline="middle"
              className="tabular" fontSize="10" fill="var(--text-muted)"
            >
              {formatMoneyCompact(t)}
            </text>
          </g>
        ))}

        {/* Zero line sits above the grid when the series crosses it. */}
        {domain[0] < 0 && (
          <line
            x1={PAD.left} x2={PAD.left + innerW}
            y1={y(0)} y2={y(0)}
            stroke="var(--axis)" strokeWidth="1"
          />
        )}

        <g clipPath={`url(#${clipId})`}>
          {series.map((s) => {
            const pts = pointsFor(s);
            return (
              <g key={s.key}>
                {s.area && pts.length > 1 && (
                  <path d={areaPath(pts, y(Math.max(domain[0], 0)))} fill={s.color} opacity="0.1" />
                )}
                <path
                  d={linePath(pts)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={s.dash}
                />
              </g>
            );
          })}
        </g>

        {months.map((m, i) =>
          i % stride === 0 || i === months.length - 1 ? (
            <text
              key={m}
              x={x[i]} y={height - 8}
              textAnchor="middle" fontSize="10" fill="var(--text-muted)"
            >
              {formatMonthShort(m)}
            </text>
          ) : null,
        )}

        {hover != null && hover >= 0 && (
          <g pointerEvents="none">
            <line
              x1={x[hover]} x2={x[hover]}
              y1={PAD.top} y2={PAD.top + innerH}
              stroke="var(--axis)" strokeWidth="1"
            />
            {series.map((s) => {
              const v = s.values[hover];
              if (v == null) return null;
              return (
                <circle
                  key={s.key}
                  cx={x[hover]} cy={y(v)} r="4"
                  fill={s.color}
                  stroke="var(--surface-1)" strokeWidth="2"
                />
              );
            })}
          </g>
        )}
      </svg>

      {hover != null && hover >= 0 && months[hover] && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border border-hairline bg-surface p-2 text-xs shadow-lg"
          style={{
            left: `${(x[hover] / width) * 100}%`,
            transform:
              x[hover] > PAD.left + innerW * 0.6
                ? 'translateX(calc(-100% - 10px))'
                : 'translateX(10px)',
          }}
        >
          <div className="mb-1 font-semibold">{formatMonth(months[hover])}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-ink-secondary">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: s.color }}
                />
                {s.label}
              </span>
              <span className="tabular font-medium">
                {s.values[hover] == null ? '—' : formatMoney(s.values[hover]!, { cents: false })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
