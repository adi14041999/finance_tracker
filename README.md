# Finance Tracker

A private expenses, budgeting and net worth dashboard. Your Google Sheet is the
database; this app reads it and draws the picture. It runs on your machine and
never writes back to the sheet.

Three pages:

- **Expenses & Budgeting** — spend against budget by category, share-of-month donut, 12-month trend per category, searchable ledger
- **Net Worth** — history, per-account table, progress toward a goal
- **Robinhood Strategy** — a placeholder, to be designed later

---

## Running it for the first time

You need [Node.js](https://nodejs.org) 20 or newer. Check with `node -v`.

```bash
npm install
npm run dev
```

Open **http://localhost:3000**.

It works immediately, on built-in sample data — invented numbers, so you can see
the app functioning before connecting anything. A banner across the top says so.
Connect your own sheet whenever you're ready.

---

## Connecting your sheet

Three things: the sheet, a robot account that can read it, and two values in a file.

### 1. The sheet

Upload `finance-tracker.xlsx` to Google Drive and open it with Google Sheets.
Delete the grey sample rows, and follow the README tab inside it.

From the sheet's URL, copy the long ID:

```
https://docs.google.com/spreadsheets/d/THIS_PART_IS_THE_ID/edit
```

### 2. A service account

A service account is a robot Google account. You share your sheet with it the
same way you'd share with a colleague, and this app signs in as the robot. That
way you never put your own Google password anywhere.

At [console.cloud.google.com](https://console.cloud.google.com):

1. Create a project (any name).
2. **APIs & Services → Library**, search for **Google Sheets API**, click **Enable**.
3. **IAM & Admin → Service Accounts → Create service account**. Give it a name;
   skip the two optional steps; click **Done**.
4. Click the new account, open the **Keys** tab, then **Add key → Create new key → JSON**.
   A `.json` file downloads. **It can only be downloaded once** — keep it somewhere safe.
5. Open that JSON file in a text editor. Find `"client_email"` — it looks like
   `something@your-project.iam.gserviceaccount.com`.
6. Go back to your Google Sheet, click **Share**, paste that address, set it to
   **Viewer**, and send.

Step 6 is the one everybody forgets. Skipping it produces a 403 that looks like
a bug in the app but isn't.

### 3. Point the app at both

One command. Pass it the JSON key you just downloaded and your sheet's URL:

```bash
npm run setup -- ~/Downloads/your-key.json "https://docs.google.com/spreadsheets/d/YOUR_ID/edit"
```

That writes `.env.local` for you and prints the service-account address to share
the sheet with. Do it this way rather than by hand: the private key is ~1,700
characters that must sit on one line with its `\n` escapes intact, and getting
it slightly wrong produces `error:1E08010C:DECODER routines::unsupported`, which
tells you nothing.

`.env.local` is gitignored, so none of it reaches GitHub. (`.env.example` shows
the format if you'd rather write it yourself.)

**Keep the JSON key outside this folder** — `~/Downloads` or `~/.config` is
fine. Google names it after your project plus a random hash, which no
`.gitignore` pattern can catch without also catching `package.json`. As a
backstop, `npm install` installs a pre-commit hook that refuses any commit
containing a private key, whatever the file is called. Remove it by deleting
`.git/hooks/pre-commit`.

Then check it:

```bash
npm run check-sheet
```

That reads your sheet and prints how many rows it found in each tab, without
starting the app — so you can tell "the sheet isn't being read" apart from
"the sheet reads fine but a page looks odd". If it fails, it says which of the
usual causes applies.

Restart `npm run dev` after editing `.env.local`. Env files are only read at startup.

---

## Using it day to day

Add expenses to the sheet as they happen. Once a month, add a balance row per
account. The app picks changes up within a minute; the **Refresh now** button in
*Data & settings* forces it immediately.

**Data & settings** (top right) also holds the data-health list: every row the
app couldn't use, named by tab, row number and column, with what was wrong. If a
number looks off, look there first.

---

## How it's put together

```
src/
  app/                 pages — one folder per route
  components/          UI, including hand-rolled SVG charts
  lib/
    sheets.ts          talks to Google
    parse.ts           raw rows -> typed data, collecting problems
    derive/            the money maths — pure functions, fully tested
    money.ts           integer-cent arithmetic
    dates.ts           string-based date handling
    chart.ts           chart geometry
```

A few decisions worth knowing, because they'd look odd otherwise:

**Money is integer cents everywhere.** Floats drift: `0.1 + 0.2` is
`0.30000000000000004`, and across a few hundred transactions that becomes totals
that don't match your sheet. Conversion happens at the edges only.

**Dates are strings, never `Date` objects.** `new Date('2026-07-14')` parses as
UTC midnight, which in a US timezone is the evening of the 13th — enough to file
an expense in the wrong month. Strings have no timezone.

**Bad rows never throw.** A typo'd category costs you that row and a line in the
data-health list. One mistake in a thousand-row sheet shouldn't take down a page.

**Missing balance months carry forward.** Forgetting to record your mortgage
shouldn't look like paying it off. Carried figures are labelled in the accounts
table and listed under "Gaps in your records".

**The charts are hand-drawn SVG**, not a charting library — one less dependency,
and the geometry is unit-tested rather than trusted.

---

## Tests

```bash
npm test
```

Covers the money arithmetic, date handling, sheet parsing, chart geometry, and
every derived figure the pages display — the parts where a silent error would
cost you real money rather than just look wrong.

```bash
npm run typecheck
```

---

## Troubleshooting

**403 from Google** — the sheet isn't shared with the service account. See step 6.

**404** — `GOOGLE_SHEET_ID` is wrong. It's only the part between `/d/` and `/edit`.

**401, or "error:1E08010C"** — the private key got mangled. Re-run
`npm run setup -- <key.json> <sheet-url> --force` rather than editing it by hand.

**"Unable to parse range"** — a tab is missing or renamed. Exactly these seven,
lowercase: `accounts`, `categories`, `transactions`, `balances`, `budgets`,
`holdings`, `config`.

**Still showing sample data** — either `.env.local` is incomplete, or the dev
server was started before you saved it. Restart it.

**Prices are blank on holdings** — `GOOGLEFINANCE` only works inside Google
Sheets, not in the uploaded `.xlsx`. Add the formulas after importing.
