import { formatMoney } from '@/lib/money';

interface Props {
  label: string;
  valueCents: number;
  /** signed change; rendered with an arrow and a word, never colour alone */
  deltaCents?: number | null;
  /** for debts, a fall is good — flips which direction reads as positive */
  invertDelta?: boolean;
  hint?: string;
  emphasis?: boolean;
}

export default function StatTile({
  label, valueCents, deltaCents, invertDelta = false, hint, emphasis = false,
}: Props) {
  const good = deltaCents == null ? null : invertDelta ? deltaCents < 0 : deltaCents > 0;

  return (
    <div className="card p-4">
      <div className="text-sm text-ink-secondary">{label}</div>
      <div
        className={[
          'mt-1 font-semibold tracking-tight',
          emphasis ? 'text-3xl' : 'text-2xl',
        ].join(' ')}
      >
        {formatMoney(valueCents, { cents: false })}
      </div>

      {deltaCents != null && (
        <div className="mt-1 flex items-center gap-1 text-sm">
          <span aria-hidden className={good ? 'text-delta-good' : 'text-ink-secondary'}>
            {deltaCents >= 0 ? '↑' : '↓'}
          </span>
          <span className={good ? 'text-delta-good' : 'text-ink-secondary'}>
            {formatMoney(Math.abs(deltaCents), { cents: false })}
          </span>
          <span className="text-ink-muted">this month</span>
        </div>
      )}

      {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}
