import { formatMoney, formatPercent } from '@/lib/money';
import type { CategorySpend } from '@/lib/derive/expenses';

/**
 * One category's spend against its budget.
 *
 * The status is stated in words as well as colour — "over by $312" — so the
 * row reads identically in greyscale, in print, or to someone who can't
 * distinguish the fill colours.
 */
export default function BudgetBar({ item }: { item: CategorySpend }) {
  const { spentCents, budgetCents, ratio, status } = item;

  const fill =
    status === 'over' ? 'bg-critical'
    : status === 'near' ? 'bg-warning'
    : status === 'under' ? 'bg-good'
    : 'bg-axis';

  // Bar length is capped at 100%; the overshoot is stated in the label instead,
  // where it can be read exactly rather than estimated from a stretched bar.
  //
  // Also floored at 0. A category can go NET NEGATIVE when refunds outweigh
  // spending — a returned Amazon order in a quiet month — and a raw ratio of
  // -0.2 becomes `width: -20%`, which is invalid CSS and renders as no bar at
  // all. That reads identically to "spent nothing", when the truth is money
  // came back. The bar sits empty and the figure beside it carries the sign.
  const credit = spentCents < 0;
  const width = ratio == null ? 0 : Math.min(1, Math.max(0, ratio));
  const overBy = budgetCents != null ? spentCents - budgetCents : 0;

  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium">{item.category}</span>
        <span className="tabular shrink-0 text-sm text-ink-secondary">
          <span className={credit ? 'text-delta-good' : undefined}>
            {formatMoney(spentCents, { cents: false })}
          </span>
          {budgetCents != null && (
            <span className="text-ink-muted">
              {' of '}
              {formatMoney(budgetCents, { cents: false })}
            </span>
          )}
        </span>
      </div>

      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
        <div
          className={`h-full rounded-full ${fill}`}
          style={{ width: `${width * 100}%` }}
          role="img"
          aria-label={
            credit
              ? `${item.category}: net refund of ${formatMoney(-spentCents)}`
              : ratio == null
                ? `${item.category}: no budget set`
                : `${item.category}: ${formatPercent(ratio)} of budget used`
          }
        />
      </div>

      <div className="mt-1 text-xs">
        <span
          className={
            credit ? 'text-delta-good'
            : status === 'over' ? 'font-medium text-critical'
            : status === 'near' ? 'text-ink-secondary'
            : 'text-ink-muted'
          }
        >
          {/* A net refund is stated outright rather than dressed up as
              "$X left", which would be true but would bury the interesting
              part: this category gave money back. */}
          {credit && `Net refund of ${formatMoney(-spentCents, { cents: false })}`}
          {!credit && status === 'over' && `Over by ${formatMoney(overBy, { cents: false })}`}
          {!credit && status === 'near' && `${formatPercent(ratio ?? 0)} used`}
          {!credit && status === 'under' && budgetCents != null &&
            `${formatMoney(budgetCents - spentCents, { cents: false })} left`}
          {!credit && status === 'none' && 'No budget set'}
        </span>
      </div>
    </div>
  );
}
