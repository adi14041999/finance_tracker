#!/usr/bin/env node
/**
 * Reads your sheet and prints what it found, without starting the app.
 *
 * Run this first when something looks wrong — it separates "the sheet isn't
 * being read" from "the sheet is read but the page looks odd", which are very
 * different problems with very different fixes.
 *
 *   npm run check-sheet
 */

const need = ['GOOGLE_SHEET_ID'];
const missing = need.filter((k) => !process.env[k]);
const hasCreds =
  (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) ||
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (missing.length || !hasCreds) {
  console.log('\n  Not configured yet.\n');
  if (missing.length) console.log(`  Missing: ${missing.join(', ')}`);
  if (!hasCreds) console.log('  Missing: GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY');
  console.log('\n  Copy .env.example to .env.local and fill it in.');
  console.log('  The app still runs without this — it just shows sample data.\n');
  process.exit(1);
}

const { GoogleAuth } = await import('google-auth-library');

const TABS = ['accounts', 'categories', 'transactions', 'balances', 'budgets', 'holdings', 'config'];

function credentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) {
    try {
      return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch {
      console.error('  GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
      process.exit(1);
    }
  }
  return {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  };
}

const creds = credentials();
console.log(`\n  Sheet:   ${process.env.GOOGLE_SHEET_ID}`);
console.log(`  Robot:   ${creds.client_email}\n`);

const auth = new GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

let token;
try {
  const client = await auth.getClient();
  token = (await client.getAccessToken()).token;
} catch (e) {
  console.error('  Could not authenticate.');
  console.error(`  ${e.message}\n`);
  console.error('  If you pasted the private key by hand, check the \\n escapes survived,');
  console.error('  and that the whole value is wrapped in double quotes.\n');
  process.exit(1);
}

const params = new URLSearchParams();
for (const tab of TABS) params.append('ranges', `${tab}!A1:Z5000`);
params.set('valueRenderOption', 'UNFORMATTED_VALUE');
params.set('dateTimeRenderOption', 'FORMATTED_STRING');

const res = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}/values:batchGet?${params}`,
  { headers: { Authorization: `Bearer ${token}` } },
);

if (!res.ok) {
  const body = await res.text();
  console.error(`  Google returned ${res.status}.\n`);
  if (res.status === 403) {
    console.error('  Almost always: the sheet has not been shared with the robot account.');
    console.error(`  Open the sheet, click Share, add ${creds.client_email} as a Viewer.\n`);
  } else if (res.status === 404) {
    console.error('  No sheet with that ID. GOOGLE_SHEET_ID is the part of the URL');
    console.error('  between /d/ and /edit.\n');
  } else if (body.includes('Unable to parse range')) {
    console.error('  A tab is missing or renamed. Expected exactly:');
    console.error(`  ${TABS.join(', ')}\n`);
  } else {
    console.error(`  ${body.slice(0, 400)}\n`);
  }
  process.exit(1);
}

const { valueRanges = [] } = await res.json();

console.log('  Connected. Rows found per tab:\n');
let total = 0;
TABS.forEach((tab, i) => {
  const rows = valueRanges[i]?.values ?? [];
  const dataRows = Math.max(0, rows.length - 1);
  total += dataRows;
  const flag = rows.length === 0 ? '  (tab empty or missing)' : '';
  console.log(`    ${tab.padEnd(14)} ${String(dataRows).padStart(5)}${flag}`);
});

console.log(`\n  ${total} data rows in total.`);
console.log('  Run "npm run dev" and open http://localhost:3000\n');
