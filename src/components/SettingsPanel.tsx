'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Problem } from '@/lib/types';

interface Props {
  source: 'sheet' | 'sample';
  fetchedAt: string;
  error: string | null;
  problems: Problem[];
  counts: { transactions: number; balances: number; accounts: number; budgets: number };
}

/**
 * Not a fourth page — a slide-over. It holds the connection state and, more
 * importantly, the data-health list: every row the parser couldn't use, named
 * by tab, row number and column, so fixing the sheet is a lookup rather than
 * a hunt.
 */
export default function SettingsPanel(props: Props) {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const errors = props.problems.filter((p) => p.severity === 'error');
  const warnings = props.problems.filter((p) => p.severity === 'warning');

  async function refresh() {
    setRefreshing(true);
    try {
      await fetch('/api/refresh', { method: 'POST' });
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink-secondary transition-colors hover:bg-sunken hover:text-ink"
      >
        {props.source === 'sample' ? (
          <span className="inline-flex items-center gap-1.5">
            <Dot className="bg-warning" />
            Sample data
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Dot className="bg-good" />
            Live
          </span>
        )}
        {errors.length > 0 && (
          <span className="rounded-full bg-critical/15 px-1.5 py-0.5 text-xs font-semibold text-critical">
            {errors.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            aria-label="Close settings"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/25"
          />
          <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-hairline bg-surface px-5 py-4">
              <h2 className="text-base font-semibold">Data &amp; settings</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-ink-secondary hover:bg-sunken"
              >
                Close
              </button>
            </div>

            <div className="space-y-6 px-5 py-5 text-sm">
              <section>
                <h3 className="mb-2 font-semibold">Connection</h3>
                {props.source === 'sheet' ? (
                  <p className="text-ink-secondary">
                    Reading live from your Google Sheet. Last fetched{' '}
                    <time dateTime={props.fetchedAt}>
                      {new Date(props.fetchedAt).toLocaleTimeString()}
                    </time>
                    .
                  </p>
                ) : (
                  <div className="space-y-2 text-ink-secondary">
                    <p>
                      Showing built-in sample data. Every number on screen is invented,
                      so you can see how the app behaves before connecting anything.
                    </p>
                    <p>
                      To connect your own sheet, copy{' '}
                      <code className="rounded bg-sunken px-1">.env.example</code> to{' '}
                      <code className="rounded bg-sunken px-1">.env.local</code>, fill in
                      the two values, and restart the dev server. The README walks through
                      getting them.
                    </p>
                  </div>
                )}

                {props.error && (
                  <div className="mt-3 rounded-lg border border-critical/30 bg-critical/10 p-3">
                    <p className="font-semibold text-critical">Couldn&apos;t reach the sheet</p>
                    <p className="mt-1 text-ink-secondary">{props.error}</p>
                  </div>
                )}

                <button
                  onClick={refresh}
                  disabled={refreshing}
                  className="mt-3 rounded-lg border border-hairline px-3 py-1.5 text-sm hover:bg-sunken disabled:opacity-50"
                >
                  {refreshing ? 'Refreshing…' : 'Refresh now'}
                </button>
              </section>

              <section>
                <h3 className="mb-2 font-semibold">What was loaded</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-ink-secondary">
                  <dt>Expenses</dt>
                  <dd className="tabular text-right text-ink">{props.counts.transactions}</dd>
                  <dt>Balance snapshots</dt>
                  <dd className="tabular text-right text-ink">{props.counts.balances}</dd>
                  <dt>Accounts</dt>
                  <dd className="tabular text-right text-ink">{props.counts.accounts}</dd>
                  <dt>Budget rows</dt>
                  <dd className="tabular text-right text-ink">{props.counts.budgets}</dd>
                </dl>
              </section>

              <section>
                <h3 className="mb-2 font-semibold">
                  Data health{' '}
                  {props.problems.length === 0 && (
                    <span className="font-normal text-good">— all clear</span>
                  )}
                </h3>

                {props.problems.length === 0 ? (
                  <p className="text-ink-secondary">
                    Every row parsed cleanly. Nothing to fix.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-ink-secondary">
                      {errors.length > 0 && (
                        <>
                          <strong className="text-critical">{errors.length} row{errors.length === 1 ? '' : 's'} skipped</strong>
                          {warnings.length > 0 && ', '}
                        </>
                      )}
                      {warnings.length > 0 && (
                        <>
                          <strong className="text-ink">{warnings.length} warning{warnings.length === 1 ? '' : 's'}</strong>
                        </>
                      )}
                      . Fix these in the sheet and refresh.
                    </p>
                    <ul className="space-y-2">
                      {props.problems.slice(0, 60).map((p, i) => (
                        <li
                          key={i}
                          className="rounded-lg border border-hairline p-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={[
                                'rounded px-1.5 py-0.5 text-xs font-semibold',
                                p.severity === 'error'
                                  ? 'bg-critical/15 text-critical'
                                  : 'bg-warning/20 text-ink',
                              ].join(' ')}
                            >
                              {p.severity === 'error' ? 'Skipped' : 'Warning'}
                            </span>
                            <span className="tabular text-xs text-ink-secondary">
                              {p.tab} · row {p.row} · {p.column}
                            </span>
                          </div>
                          <p className="mt-1 text-ink-secondary">{p.message}</p>
                        </li>
                      ))}
                    </ul>
                    {props.problems.length > 60 && (
                      <p className="text-ink-muted">
                        …and {props.problems.length - 60} more.
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${className}`} />;
}
