import { formatMoney, formatPercent } from '@/lib/money';

export interface BarItem {
  key: string;
  label: string;
  valueCents: number;
  sublabel?: string;
}

/**
 * Horizontal bars for comparing magnitudes across categories.
 *
 * One hue rather than a colour per category: colour here would encode identity
 * that the label already carries, and a nine-colour categorical scale can't be
 * made reliably distinguishable. Length does the comparing; text does the naming.
 */
export default function BarList({
  items, max, showShare = true,
}: {
  items: BarItem[];
  max?: number;
  showShare?: boolean;
}) {
  const ceiling = max ?? Math.max(1, ...items.map((i) => Math.abs(i.valueCents)));
  const total = items.reduce((a, i) => a + Math.abs(i.valueCents), 0);

  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">Nothing to show yet.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const share = total > 0 ? Math.abs(item.valueCents) / total : 0;
        return (
          <li key={item.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{item.label}</span>
              <span className="tabular shrink-0 text-ink-secondary">
                {formatMoney(item.valueCents, { cents: false })}
                {showShare && (
                  <span className="ml-2 text-ink-muted">{formatPercent(share)}</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-[4px] bg-sunken">
              <div
                className="h-full rounded-[4px] bg-series-1"
                style={{ width: `${(Math.abs(item.valueCents) / ceiling) * 100}%` }}
              />
            </div>
            {item.sublabel && (
              <div className="mt-0.5 text-xs text-ink-muted">{item.sublabel}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
