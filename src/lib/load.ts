import 'server-only';
import { cache } from 'react';
import { getSheetData, isConfigured, type FetchResult } from './sheets';

/**
 * Data loading, with two layers of caching.
 *
 * `cache()` dedupes within a single request — three components asking for the
 * data get one fetch. The module-level TTL then keeps navigation between pages
 * from hitting Google on every click.
 *
 * The TTL is deliberately short. Expenses get typed into the sheet throughout
 * the day and then checked against the page immediately, so a minute of
 * staleness reads as "the app is broken" rather than "the cache hasn't
 * expired". Fifteen seconds is well inside Google's read quota for a single
 * user, and a page reload costs nothing.
 */

/**
 * Sample or live, fixed for the life of the process by scripts/run.mjs from
 * the --sample / --live flag.
 *
 * Read once at module load rather than per request: the mode cannot change
 * while the server is running, and re-reading it every time would only invite
 * the belief that it could.
 */
const SAMPLE_MODE = process.env.DATA_MODE === 'sample';

/** Which data this process is serving. The header badge reports it. */
export function dataMode(): 'sample' | 'live' {
  return SAMPLE_MODE ? 'sample' : 'live';
}

const TTL_MS = 15_000;

let memo: { at: number; result: FetchResult } | null = null;

export function today(): string {
  // Local date, not UTC: `toISOString()` in a US timezone reports tomorrow's
  // date all evening, which would put this evening's expenses in the wrong day.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function loadUncached(): Promise<FetchResult> {
  if (SAMPLE_MODE) return getSheetData(today(), { forceSample: true });

  const now = Date.now();
  if (memo && now - memo.at < TTL_MS) return memo.result;

  const result = await getSheetData(today());
  memo = { at: now, result };
  return result;
}

export const load = cache(loadUncached);

/** Drop the cache so the next read goes back to Google. Used by the refresh button. */
export function invalidate(): void {
  memo = null;
}

export { isConfigured };
