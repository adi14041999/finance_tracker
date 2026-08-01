import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
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
 * expired". Fifteen seconds is well inside Google's read quota for a
 * single user, and the Refresh button in Settings bypasses it entirely.
 */

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
  // Checked BEFORE the memo: sample data must never land in a cache that live
  // mode then reads back, or the other way round.
  const store = await cookies();
  if (store.get('data-mode')?.value === 'sample') {
    return getSheetData(today(), { forceSample: true });
  }

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
