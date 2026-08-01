import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const creds = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  : { client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') };

const auth = new GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const token = (await (await auth.getClient()).getAccessToken()).token;
const url = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}/values/events!A1:D30?valueRenderOption=UNFORMATTED_VALUE`;
const rows = (await (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json()).values ?? [];

let run = 0;
console.log('row  month            total        YTD in sheet   running sum   drift');
for (let i = 1; i < rows.length; i++) {
  const [m, total, ytd] = rows[i];
  if (!m) continue;
  const t = Number(total) || 0;
  run += t;
  const stated = ytd === '' || ytd == null ? null : Number(ytd);
  const drift = stated === null ? null : stated - run;
  console.log(
    String(i + 1).padStart(3),
    String(m).padEnd(17),
    t.toLocaleString('en-US').padStart(10),
    (stated === null ? '—' : stated.toLocaleString('en-US')).padStart(14),
    run.toLocaleString('en-US').padStart(13),
    (drift ? '  <-- ' + (drift > 0 ? '+' : '') + drift.toLocaleString('en-US') : '').padStart(8),
  );
}
