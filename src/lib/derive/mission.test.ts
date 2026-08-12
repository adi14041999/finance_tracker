import { describe, it, expect } from 'vitest';
import {
  missionCells, missionStatus,
  MISSION_START, MISSION_END, MISSION_TARGET_DAYS, MISSION_BAR_CENTS,
  MISSION_TARGET_CENTS, MISSION_OPENING_BALANCE_CENTS,
} from './mission';
import type { MissionDay } from '../types';

let row = 1;
const day = (date: string, dollars: number): MissionDay =>
  ({ date, amountCents: Math.round(dollars * 100), row: row++ });

const status = (days: MissionDay[], today: string) =>
  missionStatus(missionCells(days, today), today);

describe('the mission constants', () => {
  it('runs 512 days from 7 Aug 2026 to 31 Dec 2027 exactly', () => {
    expect(MISSION_START).toBe('2026-08-07');
    expect(MISSION_END).toBe('2027-12-31');
    expect(MISSION_TARGET_DAYS).toBe(512);
  });

  it('sets the bar at $464', () => {
    expect(MISSION_BAR_CENTS).toBe(46_400);
  });

  it('is worth $237,568 at the bar', () => {
    expect(MISSION_TARGET_DAYS * MISSION_BAR_CENTS).toBe(23_756_800);
  });
});

describe('cells', () => {
  it('always lays out all 512 days', () => {
    expect(missionCells([], '2026-08-09')).toHaveLength(512);
  });

  it('marks days past today as future, whatever is logged', () => {
    const cells = missionCells([day('2026-08-09', 999)], '2026-08-07');
    expect(cells[0].state).toBe('unlogged');
    expect(cells[2].state).toBe('future');
  });

  it('clears at exactly $464, not a cent above', () => {
    const cells = missionCells([day('2026-08-07', 464), day('2026-08-08', 463.99)], '2026-08-08');
    expect(cells[0].state).toBe('cleared');
    expect(cells[1].state).toBe('short');
  });

  it('treats a losing day as short, not as missing', () => {
    expect(missionCells([day('2026-08-07', -200)], '2026-08-07')[0].state).toBe('short');
  });
});

describe('status', () => {
  it('counts cleared, short and unlogged days apart', () => {
    const s = status([day('2026-08-07', 500), day('2026-08-09', 100)], '2026-08-10');
    expect(s.cleared).toBe(1);
    expect(s.short).toBe(1);
    expect(s.unlogged).toBe(2); // the 8th and the 10th
    expect(s.daysElapsed).toBe(4);
  });

  it('scores days cleared, never dollars earned', () => {
    // One enormous day does not buy back the three that fell short.
    const s = status([
      day('2026-08-07', 50000), day('2026-08-08', 1),
      day('2026-08-09', 1), day('2026-08-10', 1),
    ], '2026-08-10');
    expect(s.cleared).toBe(1);
    expect(s.progress).toBeCloseTo(1 / 512, 10);
    expect(s.earnedCents).toBe(5_000_300);
  });

  it('breaks a streak on an unlogged day as well as a short one', () => {
    const s = status([day('2026-08-07', 500), day('2026-08-09', 500)], '2026-08-09');
    expect(s.longestStreak).toBe(1);
    expect(s.currentStreak).toBe(1);
  });

  it('tracks the running and longest streak separately', () => {
    const s = status([
      day('2026-08-07', 500), day('2026-08-08', 500), day('2026-08-09', 500),
      day('2026-08-10', 10), day('2026-08-11', 500),
    ], '2026-08-11');
    expect(s.longestStreak).toBe(3);
    expect(s.currentStreak).toBe(1);
  });

  it('starts with a clean sweep still on', () => {
    const s = status([], '2026-08-07');
    expect(s.perfectStillOn).toBe(true);
    expect(s.maxPossible).toBe(512);
    expect(s.stillNeeded).toBe(512);
  });

  it('lowers the best possible finish by each day that falls short', () => {
    // The window is exactly 512 days, so a short day cannot be made up. What
    // it costs is one off the ceiling, not the whole mission.
    const s = status([day('2026-08-07', 10), day('2026-08-08', 20)], '2026-08-08');
    expect(s.short).toBe(2);
    expect(s.maxPossible).toBe(510);
    expect(s.perfectStillOn).toBe(false);
  });

  it('does not count an unlogged day against the ceiling', () => {
    // A day with no row yet can still be filled in; a short day cannot be undone.
    const s = status([day('2026-08-07', 500)], '2026-08-09');
    expect(s.unlogged).toBe(2);
    expect(s.maxPossible).toBe(512);
    expect(s.perfectStillOn).toBe(true);
  });

  it('has not started the day before', () => {
    const s = status([], '2026-08-06');
    expect(s.started).toBe(false);
    expect(s.daysElapsed).toBe(0);
    expect(s.daysRemaining).toBe(512);
  });

  it('caps elapsed days at the window, past the end', () => {
    const s = status([], '2028-06-01');
    expect(s.daysElapsed).toBe(512);
    expect(s.daysRemaining).toBe(0);
  });

  it('is all zeros rather than NaN with nothing logged', () => {
    const s = status([], '2026-08-07');
    expect(s.earnedCents).toBe(0);
    expect(s.bestCents).toBeNull();
    expect(s.progress).toBe(0);
  });
});

describe('the dollar goal', () => {
  it('is 512 x $464 = $237,568', () => {
    expect(MISSION_TARGET_CENTS).toBe(23_756_800);
    expect(MISSION_TARGET_CENTS).toBe(MISSION_TARGET_DAYS * MISSION_BAR_CENTS);
  });

  it('tracks the running total against it', () => {
    const s = status([day('2026-08-07', 1000), day('2026-08-08', 1000)], '2026-08-08');
    expect(s.earnedCents).toBe(200_000);
    expect(s.moneyRemainingCents).toBe(23_556_800);
    expect(s.moneyProgress).toBeCloseTo(200_000 / 23_756_800, 10);
    expect(s.moneyAchieved).toBe(false);
  });

  it('goes past 100% rather than clamping', () => {
    // Days can never exceed 512, but dollars can — and a clamped bar would
    // hide the fact that the goal was beaten.
    const s = status([day('2026-08-07', 300000)], '2026-08-07');
    expect(s.moneyProgress).toBeGreaterThan(1);
    expect(s.moneyAchieved).toBe(true);
    expect(s.moneyRemainingCents).toBe(0);
  });

  it('counts money from short days too', () => {
    // A $100 day fails the promise but the $100 is still earned.
    const s = status([day('2026-08-07', 100)], '2026-08-07');
    expect(s.cleared).toBe(0);
    expect(s.earnedCents).toBe(10_000);
  });
});

describe('the opening balance', () => {
  it('records August 2026 at -$22,800', () => {
    expect(MISSION_OPENING_BALANCE_CENTS).toBe(-2_280_000);
  });

  it('never touches the mission arithmetic', () => {
    // Context only. Earned, progress and the target are all counted from zero
    // on day one — netting the hole into them would make every figure mean two
    // things at once.
    const s = status([day('2026-08-07', 464)], '2026-08-07');
    expect(s.earnedCents).toBe(46_400);
    expect(s.moneyRemainingCents).toBe(MISSION_TARGET_CENTS - 46_400);
  });
});

describe('days past', () => {
  it('advances with the calendar, not with days cleared', () => {
    // Four days gone, one of them cleared. Time is 4/512; the score is 1/512.
    const s = status([day('2026-08-07', 500), day('2026-08-08', 1)], '2026-08-10');
    expect(s.daysElapsed).toBe(4);
    expect(s.timeProgress).toBeCloseTo(4 / 512, 10);
    expect(s.cleared).toBe(1);
    expect(s.progress).toBeCloseTo(1 / 512, 10);
  });

  it('is zero before the mission starts', () => {
    expect(status([], '2026-08-06').timeProgress).toBe(0);
  });

  it('reaches exactly 1 on the last day and stays there', () => {
    expect(status([], '2027-12-31').timeProgress).toBe(1);
    expect(status([], '2028-05-01').timeProgress).toBe(1);
  });
});
