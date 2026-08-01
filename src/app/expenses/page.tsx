import ExpensesView from '@/components/ExpensesView';
import { load, today } from '@/lib/load';
import { addMonths, monthOf } from '@/lib/dates';

export default async function ExpensesPage() {
  const { data } = await load();
  const now = today();
  const currentMonth = monthOf(now);

  // Every month we have data for, plus the current one even if it's empty —
  // an empty current month is a real state worth being able to look at.
  const seen = new Set(data.transactions.map((t) => t.month));
  seen.add(currentMonth);

  const months = [...seen].sort();
  // Fill any holes so the picker doesn't skip a month with no spending.
  const filled: string[] = [];
  if (months.length) {
    let cur = months[0];
    const last = months[months.length - 1];
    for (let i = 0; i < 240 && cur <= last; i++) {
      filled.push(cur);
      cur = addMonths(cur, 1);
    }
  }

  return (
    <ExpensesView
      transactions={data.transactions}
      categories={data.categories}
      budgets={data.budgets}
      config={data.config}
      today={now}
      months={filled}
    />
  );
}
