import RobinhoodView from '@/components/RobinhoodView';
import { load, today, dataMode } from '@/lib/load';

export default async function RobinhoodPage() {
  const { data } = await load();
  return (
    <RobinhoodView
      positions={data.positions}
      premiums={data.premiums}
      premiumsAnoosha={data.premiumsAnoosha}
      rolls={data.rolls}
      margin={data.margin}
      events={data.events}
      mission={data.mission}
      epl={data.epl}
      today={today()}
      sample={dataMode() === 'sample'}
    />
  );
}
