import 'server-only';
import { cache } from 'react';
import { getSheetData, isConfigured, type FetchResult } from './sheets';

/**
 * Data loading, with two layers of caching.
 *
 * `cache()` dedupes within a single request — three components asking for the
 * data get one fetch. The module-level TTL then keeps navigation between pages
 * from hitting Google every time, while staying fresh enough that an edit in
 * the sheet shows up within a minute or so.
 */

const TTL_MS = 60_000;

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
