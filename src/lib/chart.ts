/**
 * Chart geometry. Pure maths, no React, so it can be unit-tested — the parts of
 * a hand-drawn SVG chart that silently go wrong are the scales and the paths.
 *
 * These are hand-rolled rather than pulled from a charting library on purpose:
 * one fewer dependency to break on install, full control over the mark specs,
 * and the geometry becomes testable instead of trusted.
 */

export interface Box {
  width: number;
  height: number;
  padTop: number;
  padRight: number;
  padBottom: number;
  padLeft: number;
}

export interface Scale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const fn = ((value: number) => {
    // A flat series has zero span; pin it to the middle rather than divide by 0.
    if (span === 0) return (r0 + r1) / 2;
    return r0 + ((value - d0) / span) * (r1 - r0);
  }) as Scale;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/** Evenly spaced band centres — one per category, for bars and month ticks. */
export function bandCentres(count: number, range: [number, number]): number[] {
  const [r0, r1] = range;
  if (count <= 0) return [];
  if (count === 1) return [(r0 + r1) / 2];
  const step = (r1 - r0) / count;
  return Array.from({ length: count }, (_, i) => r0 + step * (i + 0.5));
}

export function bandWidth(count: number, range: [number, number], inset = 0): number {
  if (count <= 0) return 0;
  const step = Math.abs(range[1] - range[0]) / count;
  return Math.max(1, step - inset);
}

/**
 * A "nice" axis domain: rounded bounds and tick values a human would choose.
 *
 * Always includes zero for money charts, because a truncated y-axis exaggerates
 * every wiggle — the classic way to make a chart lie without saying anything false.
 */
export function niceDomain(
  values: number[],
  opts: { includeZero?: boolean; tickCount?: number } = {},
): { domain: [number, number]; ticks: number[] } {
  const includeZero = opts.includeZero ?? true;
  const tickCount = opts.tickCount ?? 5;

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { domain: [0, 1], ticks: [0, 1] };

  if (includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  if (min === max) {
    // A single flat value still deserves a sensible frame.
    if (min === 0) return { domain: [0, 1], ticks: [0, 0.5, 1] };
    min = Math.min(0, min);
    max = Math.max(0, max);
  }

  const step = niceStep((max - min) / tickCount);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  // Accumulate by index rather than repeated addition, so floating point
  // error can't creep along the axis and produce 0.30000000000000004.
  const count = Math.round((niceMax - niceMin) / step);
  for (let i = 0; i <= count; i++) ticks.push(round(niceMin + i * step));

  return { domain: [niceMin, niceMax], ticks };
}

function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalised = rough / magnitude;
  const snapped = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return snapped * magnitude;
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export interface Point {
  x: number;
  y: number;
}

/** Straight-segment path. Deliberately not smoothed: a spline through monthly
 *  points invents values between them that were never measured. */
export function linePath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    // A lone point has no line; draw a short flat tick so it isn't invisible.
    const { x, y } = points[0];
    return `M ${fmt(x - 3)} ${fmt(y)} L ${fmt(x + 3)} ${fmt(y)}`;
  }
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${fmt(p.x)} ${fmt(p.y)}`)
    .join(' ');
}

/** The same line, closed down to a baseline, for the area fill under it. */
export function areaPath(points: Point[], baselineY: number): string {
  if (points.length < 2) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L ${fmt(last.x)} ${fmt(baselineY)} L ${fmt(first.x)} ${fmt(baselineY)} Z`;
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Donut/pie arc, as an SVG path. Angles clockwise from 12 o'clock. */
export function arcPath(
  cx: number, cy: number, outer: number, inner: number,
  startAngle: number, endAngle: number,
): string {
  const sweep = endAngle - startAngle;
  // A full circle can't be drawn as one arc — two halves, or it renders empty.
  if (sweep >= Math.PI * 2) {
    return [
      arcPath(cx, cy, outer, inner, 0, Math.PI),
      arcPath(cx, cy, outer, inner, Math.PI, Math.PI * 2),
    ].join(' ');
  }

  const p = (r: number, a: number) => ({
    x: cx + r * Math.sin(a),
    y: cy - r * Math.cos(a),
  });

  const o0 = p(outer, startAngle), o1 = p(outer, endAngle);
  const i1 = p(inner, endAngle), i0 = p(inner, startAngle);
  const large = sweep > Math.PI ? 1 : 0;

  return [
    `M ${fmt(o0.x)} ${fmt(o0.y)}`,
    `A ${fmt(outer)} ${fmt(outer)} 0 ${large} 1 ${fmt(o1.x)} ${fmt(o1.y)}`,
    `L ${fmt(i1.x)} ${fmt(i1.y)}`,
    `A ${fmt(inner)} ${fmt(inner)} 0 ${large} 0 ${fmt(i0.x)} ${fmt(i0.y)}`,
    'Z',
  ].join(' ');
}

/** Index of the datum nearest a pointer x — the crosshair's job. */
export function nearestIndex(xs: number[], x: number): number {
  if (xs.length === 0) return -1;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i] - x);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

/**
 * Thin out axis labels until they fit, keeping the first and last.
 * Rotated or overlapping month labels are the most common way a small chart
 * turns unreadable.
 */
export function labelStride(count: number, available: number, labelWidth = 44): number {
  if (count <= 1) return 1;
  const fits = Math.max(1, Math.floor(available / labelWidth));
  return Math.max(1, Math.ceil(count / fits));
}
