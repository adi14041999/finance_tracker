'use client';

import { useState } from 'react';
import type {
  EventMonth, MarginReading, MissionDay, Position, PremiumMonth, Roll,
} from '@/lib/types';
import PositionsTab from './PositionsTab';
import PremiumsTab from './PremiumsTab';
import RollsTab from './RollsTab';
import MarginTab from './MarginTab';
import EventsTab from './EventsTab';

/**
 * The Robinhood page is a set of tabs rather than one long scroll, because the
 * questions it answers are separate ones and mixing them makes both harder to
 * read. Adding a tab is a line in TABS and a component — the shell doesn't care
 * how many there are.
 */
const TABS = [
  { key: 'positions', label: 'Positions' },
  { key: 'premiums', label: 'Premiums' },
  { key: 'rolls', label: 'Rolls' },
  { key: 'margin', label: 'Margin' },
  { key: 'events', label: 'Event contracts' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function RobinhoodView({
  positions, premiums, premiumsAnoosha, rolls, events, margin, mission, today,
}: {
  positions: Position[];
  premiums: PremiumMonth[];
  premiumsAnoosha: PremiumMonth[];
  rolls: Roll[];
  events: EventMonth[];
  margin: MarginReading[];
  mission: MissionDay[];
  today: string;
}) {
  const [tab, setTab] = useState<TabKey>('positions');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Robinhood</h1>
      </header>

      <div className="border-b border-hairline" role="tablist" aria-label="Robinhood sections">
        <div className="-mb-px flex gap-1">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={[
                  'border-b-2 px-3 py-2 text-sm transition-colors',
                  active
                    ? 'border-series-1 font-medium text-ink'
                    : 'border-transparent text-ink-secondary hover:text-ink',
                ].join(' ')}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'positions' && <PositionsTab positions={positions} />}
      {tab === 'premiums' && (
        <PremiumsTab
          people={[
            { key: 'aditya', label: 'Aditya', tab: 'premiums', premiums },
            { key: 'anoosha', label: 'Anoosha', tab: 'premiums_anoosha', premiums: premiumsAnoosha },
          ]}
        />
      )}
      {tab === 'rolls' && <RollsTab rolls={rolls} />}
      {tab === 'margin' && <MarginTab margin={margin} today={today} />}
      {tab === 'events' && <EventsTab events={events} mission={mission} today={today} />}
    </div>
  );
}
