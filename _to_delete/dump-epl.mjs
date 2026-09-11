import fs from 'node:fs';
const env = fs.readFileSync('.env.local','utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1).replace(/\\n/g,'\n');
  process.env[m[1]] = v;
}
const { GoogleAuth } = await import('google-auth-library');
const auth = new GoogleAuth({
  credentials: process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    : { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const c = await auth.getClient();
const id = process.env.GOOGLE_SHEET_ID;
const r = await c.request({ url: `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/epl!A1:D400` });
const rows = r.data.values || [];
console.log('rows:', rows.length);
for (const row of rows) console.log(JSON.stringify(row));
