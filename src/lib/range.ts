/**
 * Time ranges, shared by the Expenses trend chart and the Net Worth history.
 *
 * One definition rather than two, so "Last 3 years" can't come to mean
 * different things on different pages.
 */

import { addMonths } from './dates';

export type Range = 'ytd' | '12m' | '3y' | '5y' | 'all';

export const RANGES: { key: Range; label: string }[] = [
  { key: 'ytd', label: 'Year to date' },
  { key: '12m', label: 'Last 12 months' },
  { key: '3y', label: 'Last 3 years' },
  { key: '5y', label: 'Last 5 years' },
  { key: 'all', label: 'All time' },
];

/**
 * The months a range covers, ending at `end`.
 *
 * Clamped to where the data actually starts. Asking for five years when you
 * have nineteen months of history gives you nineteen months, not sixty — the
 * other forty-one would be drawn as zero, which reads as "nothing happened"
 * rather than "I wasn't tracking yet". A range is a request for at most this
 * much, never a promise to invent the rest.
 */
export function rangeMonths(range: Range, end: string, earliest: string | null): string[] {
  let start: string;
  if (range === 'ytd') {
    start = `${end.slice(0, 4)}-01`;
  } else if (range === 'all') {
    start = earliest ?? end;
  } else {
    const back = range === '12m' ? 11 : range === '3y' ? 35 : 59;
    start = addMonths(end, -back);
  }

  if (earliest && start < earliest) start = earliest;
  if (start > end) start = end;

  const out: string[] = [];
  for (let m = start; m <= end; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** The first month of a range, for filtering a series that's already built. */
export function rangeStart(range: Range, end: string, earliest: string | null): string {
  const months = rangeMonths(range, end, earliest);
  return months[0];
}
