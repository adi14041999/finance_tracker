# Finance Tracker

A private expenses, budgeting and net worth dashboard. Your Google Sheet is the
database; this app reads it and draws the picture. It runs on your machine and
never writes back to the sheet.

Three pages:

- **Expenses** — spend against budget by category, share-of-month donut, trend over YTD / 12 months / 3 or 5 years / all time, with 3, 6 and 12-month running averages, searchable ledger, and the counting rules written down at the bottom
- **Net Worth** — cash / investment / debt split, history over YTD / 12 months / 3 or 5 years / all time, per-account table with 1, 3, 6 and 12-month changes
- **Robinhood** — four tabs: **Positions** (realized losses and the unrealized gains working them off), **Premiums** (daily options income, month by month), **Rolls** (what each roll cost and how much has been collected back), **Event contracts** (realized monthly profit and loss)

---

## Running it for the first time

You need [Node.js](https://nodejs.org) 20 or newer. Check with `node -v`.

```bash
npm install
npm run sample
```

Open **http://localhost:3000**.

That runs on built-in sample data — invented numbers, so you can see the app
functioning before connecting anything. Once your sheet is connected:

```bash
npm run live
```

**The mode is fixed when the server starts.** There is no switch in the app,
because there would be nothing for a page to switch: `--sample` never touches
Google at all, and `--live` refuses to start without credentials rather than
quietly showing invented numbers instead. A badge in the header says which one
you are looking at.

`npm run sample` and `npm run live` are shorthand for `npm run dev` with the
flag. Plain `npm run dev` picks live if a sheet is configured and sample if not.

The flags themselves work on `build` and `start` too. They need `--` in front,
which is npm's separator, not the app's — without it npm treats `--live` as one
of its own options and never passes it on:

```bash
npm run build -- --live
npm run start -- --live
npm run dev   -- --sample -p 4000   # other flags pass through to Next
```

---

## Connecting your sheet

Three things: the sheet, a robot account that can read it, and two values in a file.

### 1. The sheet

Upload `finance-tracker.xlsx` to Google Drive and open it with Google Sheets,
then delete the grey sample rows.

The app reads eleven tabs, named exactly, lowercase: `accounts`, `categories`,
`transactions`, `balances`, `budgets`, `positions`, `premiums`,
`premiums_anoosha`, `rolls`, `events`, `config`. A tab you don't use can be left
empty or left out entirely — the app checks which tabs exist before reading, and
names any that are missing rather than failing. `seed-data/` holds a CSV per tab
showing the expected columns.

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

**Expenses** go in as they happen — several times a day is fine. The app
re-reads the sheet at most every 15 seconds, so a row you just typed shows up
almost immediately; reload the page if you don't want to wait.

**Balances** go in once a month, on the 21st: one row per account.

To close an account, record a final balance of `0` and stop adding rows for it.
Don't delete it from `accounts` — older balance rows still refer to it, and
removing it would rewrite your history.

Balances are grouped by month, so the day you snapshot on doesn't matter to the
maths — but consistency does. Snapshotting on the 21st one month and the 3rd the
next makes one interval 40 days and the next 20, and the chart can't tell you
that. Pick a day and keep it.

Accounts that haven't moved can be skipped; the app carries the last figure
forward, marks it "carried forward" in the table, and lists it under "Gaps in
your records" so a stale number never passes for a fresh one.

**Rows the app couldn't read** appear in an amber strip under the header, named
by tab, row number and column, with what was wrong. It only shows up when there
is something to say, so an empty header means a clean sheet.

**Live sheet / Sample** (top right) says which data this server is serving —
set by the flag you started it with, and unchangeable until you restart. Sample
data is invented and shares nothing with your sheet, which makes it safe for
screenshots.

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
problems strip. One mistake in a thousand-row sheet shouldn't take down a page.

**Missing balance months carry forward.** Forgetting to record your mortgage
shouldn't look like paying it off. Carried figures are labelled in the accounts
table and listed under "Gaps in your records".

**Running totals in the sheet are recomputed, never read.** The `Total` column on
`premiums`, `total cost` on `rolls` and the year-to-date column on `events` are
all recalculated from the cells beneath them and compared against what the sheet
says. A stale formula gets named instead of quietly reported as fact.

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

**"Unable to parse range"** — a tab is missing or renamed. Exactly these eleven,
lowercase: `accounts`, `categories`, `transactions`, `balances`, `budgets`,
`positions`, `premiums`, `premiums_anoosha`, `rolls`, `events`, `config`.

**Still showing sample data** — you started with `npm run sample`, or with
`npm run dev` and no credentials. Restart with `npm run live`; if it refuses,
it names what is missing.

**Prices are blank on Positions** — `GOOGLEFINANCE` only works inside Google
Sheets, not in the uploaded `.xlsx`. Add the formulas after importing. A ticker
Google can't resolve also comes back blank; the app shows the row without a gain
rather than guessing at one.
