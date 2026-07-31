/**
 * Date handling. Everything is a plain YYYY-MM-DD or YYYY-MM string.
 *
 * We deliberately avoid the Date object for anything but arithmetic, because
 * `new Date('2026-07-14')` parses as UTC midnight while `new Date(2026, 6, 14)`
 * parses as local midnight, and in a US timezone that difference silently
 * shifts a transaction into the previous month. Strings don't have timezones.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

export function isValidDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const [, y, mo, d] = m;
  const year = Number(y), month = Number(mo), day = Number(d);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

export function isValidMonth(s: string): boolean {
  const m = ISO_MONTH.exec(s);
  if (!m) return false;
  const month = Number(m[2]);
  return month >= 1 && month <= 12;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** '2026-07-14' -> '2026-07' */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/**
 * Normalise whatever the sheet gave us into YYYY-MM-DD, or null.
 *
 * Handles the ISO string we ask for, plus two things Sheets does on its own:
 * a serial number (days since 1899-12-30) if the render option ever changes,
 * and US-style M/D/YYYY if the column got reformatted by hand.
 */
export function normaliseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return fromSerial(value);
  }

  const s = String(value).trim();
  if (isValidDate(s)) return s;

  // Sheets sometimes hands back a full timestamp; the date part is enough.
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const head = s.slice(0, 10);
    return isValidDate(head) ? head : null;
  }

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    const [, mo, d, y] = us;
    const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return isValidDate(iso) ? iso : null;
  }

  if (/^\d+(\.\d+)?$/.test(s)) return fromSerial(Number(s));

  return null;
}

/** Spreadsheet serial number -> ISO date. Epoch is 1899-12-30. */
function fromSerial(serial: number): string | null {
  if (serial < 1 || serial > 2958465) return null; // year 1900..9999
  const ms = Math.round(serial) * 86400000;
  const epoch = Date.UTC(1899, 11, 30);
  const d = new Date(epoch + ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Normalise a month cell into YYYY-MM, or null. Accepts a full date too. */
export function normaliseMonth(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (isValidMonth(s)) return s;
  const asDate = normaliseDate(value);
  return asDate ? monthOf(asDate) : null;
}

/** '2026-07' + 1 -> '2026-08'. Negative n goes backwards. */
export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12 + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Every month from `from` to `to` inclusive. Empty if `to` precedes `from`. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  // Guard against a malformed range spinning forever.
  for (let i = 0; i < 1200 && cur <= to; i++) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

/** 'July 2026' */
export function formatMonth(month: string): string {
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const m = Number(month.slice(5, 7));
  return `${names[m - 1]} ${month.slice(0, 4)}`;
}

/** 'Jul 2026' */
export function formatMonthShort(month: string): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
    'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = Number(month.slice(5, 7));
  return `${names[m - 1]} ${month.slice(2, 4)}`;
}

/** '14 Jul' — for transaction rows inside a known month. */
export function formatDayMonth(date: string): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
    'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = Number(date.slice(5, 7));
  return `${Number(date.slice(8, 10))} ${names[m - 1]}`;
}

/**
 * How far through a month we are, 0..1. Used to compare budget consumed against
 * time elapsed. `today` is passed in rather than read from the clock so this
 * stays a pure function and the tests are deterministic.
 */
export function monthProgress(month: string, today: string): number {
  const cur = monthOf(today);
  if (cur > month) return 1;
  if (cur < month) return 0;
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const day = Number(today.slice(8, 10));
  return day / daysInMonth(y, m);
}
