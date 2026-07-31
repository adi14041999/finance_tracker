#!/usr/bin/env node
/**
 * Installs a pre-commit hook that refuses to commit a private key.
 *
 * Runs automatically after `npm install` via the "prepare" script.
 *
 * Why bother, when .gitignore exists: Google names the service-account key it
 * downloads after your project plus a random hash —
 * "finance-tracker-471203-a1b2c3d4e5f6.json" — and no filename pattern catches
 * that without also catching package.json. Filename rules are guessing. This
 * checks the actual bytes you're about to commit, which isn't.
 *
 * To remove it: delete .git/hooks/pre-commit.
 */

import { writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const gitDir = join(process.cwd(), '.git');
if (!existsSync(gitDir)) {
  // Not a git checkout (someone unzipped a tarball) — nothing to install.
  process.exit(0);
}

const HOOK = `#!/bin/sh
# Installed by scripts/install-hooks.mjs. Delete this file to remove it.
#
# Refuses any commit containing a private key or a Google service-account blob,
# whatever the file is called.

if git diff --cached -U0 | grep -qE 'BEGIN [A-Z ]*PRIVATE KEY|"private_key"[[:space:]]*:'; then
  echo ""
  echo "  BLOCKED: something in this commit contains a private key."
  echo ""
  echo "  Files staged:"
  git diff --cached --name-only | sed 's/^/    /'
  echo ""
  echo "  Move the key outside the repo (~/Downloads or ~/.config is fine) and"
  echo "  point \\"npm run setup\\" at it there. Then:  git reset"
  echo ""
  echo "  If you are certain this is a false alarm:  git commit --no-verify"
  echo ""
  exit 1
fi
`;

const hooksDir = join(gitDir, 'hooks');
mkdirSync(hooksDir, { recursive: true });
const path = join(hooksDir, 'pre-commit');

writeFileSync(path, HOOK, { mode: 0o755 });
try {
  chmodSync(path, 0o755);
} catch {
  // Some filesystems refuse chmod; the write above usually suffices.
}

console.log('pre-commit hook installed (blocks committing private keys)');
