/**
 * Reads the Google Sheet.
 *
 * Auth is a service account: a robot Google account whose email you share the
 * sheet with. Read-only scope, so this app is structurally incapable of
 * changing your data no matter what bug it contains.
 *
 * If credentials are absent or broken we fall back to sample data rather than
 * showing an error page, and the app says so in the header. That means a fresh
 * clone runs immediately, and a credential mistake never leaves you staring at
 * a blank screen wondering which part broke.
 */

import 'server-only';
import { GoogleAuth } from 'google-auth-library';
import type { RawRows, RawSheet } from './parse';
import { parseSheet } from './parse';
import { sampleSheet } from './fixtures';
import type { SheetData } from './types';

const TABS = [
  'accounts', 'categories', 'transactions',
  'balances', 'budgets', 'positions', 'premiums', 'premiums_anoosha', 'rolls', 'config',
] as const;

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

/**
 * How far right to read. Wide enough for the premiums grid, which is the only
 * tab that is genuinely wide: a Month column, days 1..31, Total, net worth and
 * percent — 35 columns.
 *
 * This was A1:Z5000, and Z is column 26. Every column past it was silently
 * absent rather than an error, so the premiums tab lost days 26..31 and the net
 * worth column from every month and simply reported a smaller total. Nothing in
 * the app could have caught it: the rows parsed cleanly, they were just short.
 * Requesting more columns than exist costs nothing -- Sheets returns only what
 * is populated -- so the range is set well past any plausible sheet.
 */
const RANGE = 'A1:BZ5000';

export interface FetchResult {
  data: SheetData;
  error: string | null;
}

function credentialsFromEnv(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.client_email && parsed.private_key) return parsed;
    } catch {
      // Fall through to the split-variable form below.
    }
  }

  const email = process.env.GOOGLE_CLIENT_EMAIL;
  // Env files can't hold real newlines, so the key arrives with literal \n.
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (email && key) return { client_email: email, private_key: key };

  return null;
}

export function isConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SHEET_ID && credentialsFromEnv());
}

/**
 * One batchGet for all seven tabs — a single round trip rather than seven.
 *
 * UNFORMATTED_VALUE keeps "$1,204.88" from arriving as a string, and
 * FORMATTED_STRING keeps dates from arriving as spreadsheet serial numbers.
 * Getting this pair wrong is the single most common source of bugs in
 * sheet-backed apps, which is why it's spelled out here rather than defaulted.
 */
async function fetchRaw(sheetId: string): Promise<{ raw: RawSheet; missing: string[] }> {
  const credentials = credentialsFromEnv();
  if (!credentials) throw new Error('No credentials');

  const auth = new GoogleAuth({ credentials, scopes: [SCOPE] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Could not obtain an access token');

  const headers = { Authorization: `Bearer ${token.token}` };

  // Which tabs actually exist, before asking for any of them.
  //
  // batchGet is all-or-nothing: name one range whose tab is absent and the
  // whole request 400s, so a single missing tab would take down Expenses, Net
  // Worth and everything else along with it. One cheap metadata call turns that
  // into "this one tab is empty and Settings says which", which is a far more
  // proportionate response to forgetting to add a sheet.
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties.title`;
  const metaResponse = await fetch(metaUrl, { headers, cache: 'no-store' });
  if (!metaResponse.ok) {
    throw new Error(explain(metaResponse.status, await metaResponse.text()));
  }
  const meta = (await metaResponse.json()) as {
    sheets?: { properties?: { title?: string } }[];
  };
  const present = new Set(
    (meta.sheets ?? []).map((sh) => String(sh.properties?.title ?? '').trim().toLowerCase()),
  );

  const wanted = TABS.filter((tab) => present.has(tab));
  const missing = TABS.filter((tab) => !present.has(tab));

  const out = {} as RawSheet;
  for (const tab of TABS) out[tab] = [];
  if (wanted.length === 0) return { raw: out, missing };

  const params = new URLSearchParams();
  for (const tab of wanted) params.append('ranges', `${tab}!${RANGE}`);
  params.set('valueRenderOption', 'UNFORMATTED_VALUE');
  params.set('dateTimeRenderOption', 'FORMATTED_STRING');
  params.set('majorDimension', 'ROWS');

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchGet?${params}`;

  const response = await fetch(url, { headers, cache: 'no-store' });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(explain(response.status, body));
  }

  const json = (await response.json()) as { valueRanges?: { values?: RawRows }[] };
  const ranges = json.valueRanges ?? [];

  wanted.forEach((tab, i) => {
    out[tab] = ranges[i]?.values ?? [];
  });
  return { raw: out, missing };
}

/** Turns Google's error bodies into something worth reading. */
function explain(status: number, body: string): string {
  if (status === 403) {
    if (body.includes('caller does not have permission') || body.includes('PERMISSION_DENIED')) {
      return 'Google refused the request (403). The usual cause is that the sheet has not been shared with the service account. Open the sheet, click Share, and add the client_email from your credentials as a Viewer.';
    }
    return 'Google refused the request (403). Check that the Google Sheets API is enabled for your Cloud project.';
  }
  if (status === 404) {
    return 'No sheet with that ID (404). GOOGLE_SHEET_ID should be the part of the URL between /d/ and /edit.';
  }
  if (status === 400 && body.includes('Unable to parse range')) {
    return 'One of the ten tabs is missing or renamed. The app expects tabs named exactly: accounts, categories, transactions, balances, budgets, positions, premiums, premiums_anoosha, rolls, config.';
  }
  if (status === 401) {
    return 'Google rejected the credentials (401). If you pasted the private key by hand, check that the \\n escapes survived intact.';
  }
  return `Google returned ${status}. ${body.slice(0, 300)}`;
}

export async function getSheetData(today: string): Promise<FetchResult> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const fetchedAt = new Date().toISOString();

  if (!sheetId || !credentialsFromEnv()) {
    return {
      data: parseSheet(sampleSheet(today), { fetchedAt, source: 'sample' }),
      error: null,
    };
  }

  try {
    const { raw, missing } = await fetchRaw(sheetId);
    const data = parseSheet(raw, { fetchedAt, source: 'sheet' });
    // Named rather than silent: an empty page because a tab is missing looks
    // exactly like an empty page because you haven't typed anything yet.
    for (const tab of missing) {
      data.problems.push({
        tab, row: 1, column: '—', severity: 'warning',
        message: `There's no tab called "${tab}" in your sheet, so anything that reads it is empty. Add a tab with that exact name, or ignore this if you don't use it.`,
      });
    }
    return { data, error: null };
  } catch (e) {
    // Show the demo rather than a dead page, and say plainly what went wrong.
    return {
      data: parseSheet(sampleSheet(today), { fetchedAt, source: 'sample' }),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
