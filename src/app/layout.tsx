import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';
import DataSource from '@/components/DataSource';
import { load, isConfigured } from '@/lib/load';

export const metadata: Metadata = {
  title: 'Finance Tracker',
  description: 'Expenses, budgeting and net worth, read from a Google Sheet.',
};

// Always render fresh on the server; the data layer does its own caching.
export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data, error } = await load();

  return (
    <html lang="en">
      <body className="min-h-screen bg-page">
        <header className="sticky top-0 z-40 border-b border-hairline bg-page/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
            <div className="flex items-center gap-6">
              <span className="text-sm font-semibold tracking-tight">Finance</span>
              <Nav />
            </div>
            <DataSource source={data.source} configured={isConfigured()} />
          </div>
        </header>

        {data.source === 'sample' && (
          <div className="border-b border-hairline bg-warning/10">
            <div className="mx-auto max-w-6xl px-6 py-2 text-sm text-ink-secondary">
              <strong className="text-ink">Sample data.</strong> These numbers are
              invented so you can see the app working. Switch to{' '}
              <strong className="text-ink">Live sheet</strong> at the top right once your
              credentials are set up.
            </div>
          </div>
        )}

        {/* The only remaining home for parse problems. Rows the app couldn't
            make sense of are never thrown away silently — without something
            here, a mistyped category would just quietly vanish from every
            total. Shown only when there is something to say. */}
        {data.problems.length > 0 && (
          <div className="border-b border-hairline bg-warning/10">
            <details className="mx-auto max-w-6xl px-6 py-2 text-sm">
              <summary className="cursor-pointer text-ink-secondary">
                <strong className="text-ink">
                  {data.problems.length} row{data.problems.length === 1 ? '' : 's'}
                </strong>{' '}
                in your sheet couldn&apos;t be read. Everything else still adds up.
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-ink-secondary">
                {data.problems.slice(0, 12).map((p, i) => (
                  <li key={i}>
                    <span className="tabular font-medium text-ink">
                      {p.tab} row {p.row}
                    </span>
                    {' · '}
                    {p.column}
                    {' — '}
                    {p.message}
                  </li>
                ))}
                {data.problems.length > 12 && (
                  <li className="text-ink-muted">
                    …and {data.problems.length - 12} more.
                  </li>
                )}
              </ul>
            </details>
          </div>
        )}

        {error && (
          <div className="border-b border-hairline bg-critical/10">
            <div className="mx-auto max-w-6xl px-6 py-2 text-sm text-ink-secondary">
              <strong className="text-ink">Couldn&apos;t read your sheet.</strong> {error}
            </div>
          </div>
        )}

        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>

        <footer className="mx-auto max-w-6xl px-6 pb-10 text-xs text-ink-muted">
          Read-only. This app never writes to your sheet.
        </footer>
      </body>
    </html>
  );
}
