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
  'balances', 'budgets', 'holdings', 'config',
] as const;

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

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
async function fetchRaw(sheetId: string): Promise<RawSheet> {
  const credentials = credentialsFromEnv();
  if (!credentials) throw new Error('No credentials');

  const auth = new GoogleAuth({ credentials, scopes: [SCOPE] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Could not obtain an access token');

  const params = new URLSearchParams();
  for (const tab of TABS) params.append('ranges', `${tab}!A1:Z5000`);
  params.set('valueRenderOption', 'UNFORMATTED_VALUE');
  params.set('dateTimeRenderOption', 'FORMATTED_STRING');
  params.set('majorDimension', 'ROWS');

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchGet?${params}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token.token}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(explain(response.status, body));
  }

  const json = (await response.json()) as { valueRanges?: { values?: RawRows }[] };
  const ranges = json.valueRanges ?? [];

  const out = {} as RawSheet;
  TABS.forEach((tab, i) => {
    out[tab] = ranges[i]?.values ?? [];
  });
  return out;
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
    return 'One of the seven tabs is missing or renamed. The app expects tabs named exactly: accounts, categories, transactions, balances, budgets, holdings, config.';
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
    const raw = await fetchRaw(sheetId);
    return { data: parseSheet(raw, { fetchedAt, source: 'sheet' }), error: null };
  } catch (e) {
    // Show the demo rather than a dead page, and say plainly what went wrong.
    return {
      data: parseSheet(sampleSheet(today), { fetchedAt, source: 'sample' }),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
