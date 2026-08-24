#!/usr/bin/env node
/**
 * Launcher that fixes the data mode for the whole run.
 *
 *   npm run dev -- --sample     invented numbers, no Google, no credentials
 *   npm run dev -- --live       your sheet, and it fails loudly without one
 *   npm run dev                 live if credentials exist, sample if not
 *
 * The mode is decided HERE, once, and passed to Next as an environment
 * variable. It used to be a switch in the browser, which meant every page had
 * to stay ready to serve either — and left a permanent question of which one
 * you were looking at. A flag on the command that started the server cannot
 * drift: the answer is in your shell history.
 *
 * `--live` is deliberately strict. Falling back to sample data when a
 * credential is missing is the right behaviour for a bare `npm run dev`, but
 * someone who typed `--live` asked for their own numbers, and quietly showing
 * invented ones instead is the worst possible answer.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const command = argv[0]; // dev | build | start
const flags = argv.slice(1);

const wantsSample = flags.includes('--sample');
const wantsLive = flags.includes('--live');

if (wantsSample && wantsLive) {
  console.error('\n  Pick one: --sample or --live, not both.\n');
  process.exit(1);
}

/**
 * Is a sheet actually configured? Read straight from .env.local rather than
 * process.env, because Next loads that file itself and it is not in our
 * environment yet.
 */
function hasCredentials() {
  if (process.env.GOOGLE_SHEET_ID && (process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    || (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY))) {
    return true;
  }
  if (!existsSync('.env.local')) return false;
  const text = readFileSync('.env.local', 'utf8');
  const has = (key) => new RegExp(`^\\s*${key}\\s*=\\s*\\S`, 'm').test(text);
  return has('GOOGLE_SHEET_ID')
    && (has('GOOGLE_SERVICE_ACCOUNT_JSON')
      || (has('GOOGLE_CLIENT_EMAIL') && has('GOOGLE_PRIVATE_KEY')));
}

const configured = hasCredentials();

if (wantsLive && !configured) {
  console.error(`
  --live needs a connected sheet, and there isn't one.

  Either set it up:      npm run setup -- <key.json> "<sheet-url>"
  or run on sample data: npm run ${command} -- --sample
`);
  process.exit(1);
}

const mode = wantsSample ? 'sample' : wantsLive ? 'live' : (configured ? 'live' : 'sample');

const label = wantsSample || wantsLive ? `--${mode}` : `${mode} (no flag given)`;
console.log(`\n  Data mode: ${mode.toUpperCase()}  ${
  mode === 'sample' ? '— invented numbers, your sheet is not read' : '— reading your Google Sheet'
}\n  Started with: ${label}\n`);

// Anything that isn't ours goes through to Next untouched, so `-p 4000` and
// friends keep working.
const passthrough = flags.filter((f) => f !== '--sample' && f !== '--live');

const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', command, ...passthrough],
  { stdio: 'inherit', env: { ...process.env, DATA_MODE: mode } },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
