import { load } from '@/lib/load';
import { formatMoney } from '@/lib/money';

export default async function RobinhoodPage() {
  const { data } = await load();

  const positions = data.holdings.length;
  const valueCents = data.holdings.reduce((a, h) => a + h.marketValueCents, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Robinhood Strategy</h1>
        <p className="mt-0.5 text-sm text-ink-secondary">Not built yet — by design.</p>
      </header>

      <section className="card p-6">
        <p className="max-w-2xl text-sm text-ink-secondary">
          This page is a placeholder. We agreed to design it once expenses and net
          worth were working, so the shell and routing exist and building it later
          is additive rather than structural.
        </p>
        <p className="mt-3 max-w-2xl text-sm text-ink-secondary">
          In the meantime the <code className="rounded bg-sunken px-1">holdings</code>{' '}
          tab of your sheet is quietly collecting the raw material this page will
          need — positions, quantities, live prices and cost basis — so when we do
          design it, there will be real history to work with instead of an empty tab.
        </p>

        <dl className="mt-6 grid max-w-md grid-cols-2 gap-4 border-t border-hairline pt-4">
          <div>
            <dt className="text-xs text-ink-muted">Positions on file</dt>
            <dd className="tabular mt-0.5 text-lg font-medium">{positions}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Combined market value</dt>
            <dd className="tabular mt-0.5 text-lg font-medium">
              {formatMoney(valueCents, { cents: false })}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
