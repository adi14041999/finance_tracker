import NetWorthView from '@/components/NetWorthView';
import { load } from '@/lib/load';

export default async function NetWorthPage() {
  const { data } = await load();
  return (
    <NetWorthView
      accounts={data.accounts}
      balances={data.balances}
      config={data.config}
    />
  );
}
