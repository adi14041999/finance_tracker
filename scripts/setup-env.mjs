#!/usr/bin/env node
/**
 * Writes .env.local from your downloaded service-account JSON key.
 *
 *   npm run setup -- ~/Downloads/your-key.json <sheet-id-or-url>
 *
 * Doing this by hand means copying a 1,700-character private key out of a JSON
 * file, keeping its \n escapes intact, and wrapping the whole thing in quotes.
 * That's the single most common way this setup fails, and the error it produces
 * ("error:1E08010C:DECODER routines::unsupported") tells you nothing useful.
 * So: let the machine do the copying.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2).filter((a) => a !== '--force');
const force = process.argv.includes('--force');

function die(message, ...rest) {
  console.error(`\n  ${message}\n`);
  for (const line of rest) console.error(`  ${line}`);
  console.error('');
  process.exit(1);
}

if (args.length < 2) {
  die(
    'Usage:  npm run setup -- <path-to-key.json> <sheet-id-or-url>',
    'Example:',
    '  npm run setup -- ~/Downloads/finance-abc123.json \\',
    '    https://docs.google.com/spreadsheets/d/1AbC.../edit',
    '',
    'The JSON file is the key you downloaded from Google Cloud',
    '(IAM & Admin > Service Accounts > your account > Keys > Add key).',
  );
}

const [keyPathRaw, sheetArg] = args;
const keyPath = resolve(keyPathRaw.replace(/^~/, process.env.HOME ?? '~'));

if (!existsSync(keyPath)) {
  die(`No file at ${keyPath}`, 'Check the path to the JSON key you downloaded.');
}

let key;
try {
  key = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch {
  die(
    `${keyPath} isn't valid JSON.`,
    'Make sure you picked the key file Google downloaded, not something else.',
  );
}

if (!key.client_email || !key.private_key) {
  die(
    'That JSON has no "client_email" and "private_key".',
    'You may have downloaded an OAuth client secret instead of a service-account key.',
    'In Google Cloud go to IAM & Admin > Service Accounts, click your account,',
    'then Keys > Add key > Create new key > JSON.',
  );
}

// Accept either a bare ID or the whole URL, because pasting the URL is what
// people actually do.
const fromUrl = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(sheetArg);
const sheetId = fromUrl ? fromUrl[1] : sheetArg.trim();

if (!/^[a-zA-Z0-9-_]{20,}$/.test(sheetId)) {
  die(
    `"${sheetId}" doesn't look like a sheet ID.`,
    'It should be the long string between /d/ and /edit in the sheet URL,',
    'or just paste the whole URL and I will pull it out.',
  );
}

const target = resolve(process.cwd(), '.env.local');
if (existsSync(target) && !force) {
  die(
    '.env.local already exists.',
    'Re-run with --force to overwrite it:',
    `  npm run setup -- ${keyPathRaw} ${sheetArg} --force`,
  );
}

// Real newlines become the literal two characters \ and n, which is the only
// form an env file can carry.
const escaped = key.private_key.replace(/\n/g, '\\n');

writeFileSync(
  target,
  [
    '# Written by "npm run setup". Gitignored — never commit this file.',
    '',
    `GOOGLE_SHEET_ID=${sheetId}`,
    `GOOGLE_CLIENT_EMAIL=${key.client_email}`,
    `GOOGLE_PRIVATE_KEY="${escaped}"`,
    '',
  ].join('\n'),
  { mode: 0o600 },
);

console.log(`
  Wrote .env.local

    sheet    ${sheetId}
    robot    ${key.client_email}

  ONE STEP LEFT, and it's the one everyone forgets:

    Open your Google Sheet, click Share, paste

      ${key.client_email}

    give it Viewer access, and send. Untick "Notify people" — it's a robot.

  Then:

    npm run check-sheet     confirm it reads
    npm run dev             open http://localhost:3000
`);
