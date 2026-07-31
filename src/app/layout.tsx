import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';
import SettingsPanel from '@/components/SettingsPanel';
import { load } from '@/lib/load';

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
            <SettingsPanel
              source={data.source}
              fetchedAt={data.fetchedAt}
              error={error}
              problems={data.problems}
              counts={{
                transactions: data.transactions.length,
                balances: data.balances.length,
                accounts: data.accounts.length,
                budgets: data.budgets.length,
              }}
            />
          </div>
        </header>

        {data.source === 'sample' && (
          <div className="border-b border-hairline bg-warning/10">
            <div className="mx-auto max-w-6xl px-6 py-2 text-sm text-ink-secondary">
              <strong className="text-ink">Sample data.</strong> These numbers are
              invented so you can see the app working. Connect your sheet in{' '}
              <em>Data &amp; settings</em>, top right.
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
