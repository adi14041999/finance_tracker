'use client';

import { useMemo, useState } from 'react';
import type {
  EplFixture, EventMonth, MarginReading, MissionDay, Position, PremiumMonth, Roll,
} from '@/lib/types';
import PositionsTab from './PositionsTab';
import PremiumsTab from './PremiumsTab';
import RollsTab from './RollsTab';
import MarginTab from './MarginTab';
import EventsTab from './EventsTab';

/**
 * The Robinhood page is a set of tabs rather than one long scroll, because the
 * questions it answers are separate ones and mixing them makes both harder to
 * read. Adding a tab is a line in ALL_TABS and a component — the shell doesn't
 * care how many there are.
 *
 * `liveOnly` marks a tab that is hidden under --sample. Event contracts carries
 * the missions, and a mission is a commitment with real dates and real money on
 * it — inventing one produces something that looks like a goal and isn't. A
 * fabricated spending history is a harmless illustration; a fabricated promise
 * to earn $315,392 is not the same kind of thing, so sample mode simply does
 * not have that page.
 */
const ALL_TABS = [
  { key: 'positions', label: 'Positions' },
  { key: 'premiums', label: 'Premiums' },
  { key: 'rolls', label: 'Rolls' },
  { key: 'margin', label: 'Margin' },
  { key: 'events', label: 'Event contracts', liveOnly: true },
] as const;

type TabKey = (typeof ALL_TABS)[number]['key'];

export default function RobinhoodView({
  positions, premiums, premiumsAnoosha, rolls, events, margin, mission, epl,
  today, sample,
}: {
  positions: Position[];
  premiums: PremiumMonth[];
  premiumsAnoosha: PremiumMonth[];
  rolls: Roll[];
  events: EventMonth[];
  margin: MarginReading[];
  mission: MissionDay[];
  epl: EplFixture[];
  today: string;
  /** True when the server was started with --sample. */
  sample: boolean;
}) {
  const tabs = useMemo(
    () => ALL_TABS.filter((t) => !('liveOnly' in t && t.liveOnly && sample)),
    [sample],
  );
  const [tab, setTab] = useState<TabKey>('positions');

  // A tab that has been filtered away must never stay selected — belt and
  // braces, since 'positions' is always present and is the initial state.
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Robinhood</h1>
      </header>

      <div className="border-b border-hairline" role="tablist" aria-label="Robinhood sections">
        <div className="-mb-px flex gap-1">
          {tabs.map((t) => {
            const isActive = t.key === active;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t.key)}
                className={[
                  'border-b-2 px-3 py-2 text-sm transition-colors',
                  isActive
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

      {active === 'positions' && <PositionsTab positions={positions} />}
      {active === 'premiums' && (
        <PremiumsTab
          people={[
            { key: 'aditya', label: 'Aditya', tab: 'premiums', premiums },
            { key: 'anoosha', label: 'Anoosha', tab: 'premiums_anoosha', premiums: premiumsAnoosha },
          ]}
        />
      )}
      {active === 'rolls' && <RollsTab rolls={rolls} />}
      {active === 'margin' && <MarginTab margin={margin} today={today} />}
      {active === 'events' && <EventsTab events={events} mission={mission} epl={epl} today={today} />}
    </div>
  );
}
