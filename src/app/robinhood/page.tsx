import RobinhoodView from '@/components/RobinhoodView';
import { load } from '@/lib/load';

export default async function RobinhoodPage() {
  const { data } = await load();
  return <RobinhoodView positions={data.positions} />;
}
