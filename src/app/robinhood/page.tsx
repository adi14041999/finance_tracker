import RobinhoodView from '@/components/RobinhoodView';
import { load, today } from '@/lib/load';

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
      today={today()}
    />
  );
}
