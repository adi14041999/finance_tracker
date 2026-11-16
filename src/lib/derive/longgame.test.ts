import { describe, it, expect } from 'vitest';
import {
  longGameStatus, LONG_GAME_TARGET_CENTS, LONG_GAME_DAYS,
} from './longgame';
import { SPRINT_DAILY_CENTS } from './sprints';
import { daysBetween } from '../dates';

/** mcnst: the first sprint, and so the day the decade starts. */
const START = '2026-11-06';
const END = '2036-11-07';

describe('the shape of the long game', () => {
  it('targets $983,000 — ten years of 7% real on half a million', () => {
    expect(LONG_GAME_TARGET_CENTS).toBe(98_300_000);
  });

  it('runs 3,655 days, the first day the rate reaches the target', () => {
    expect(LONG_GAME_DAYS).toBe(3_655);
    expect(SPRINT_DAILY_CENTS * 3_654).toBeLessThan(LONG_GAME_TARGET_CENTS);
    expect(SPRINT_DAILY_CENTS * 3_655).toBeGreaterThanOrEqual(LONG_GAME_TARGET_CENTS);
  });

  it('opens on the first sprint’s first day and closes 3,655 days later', () => {
    const s = longGameStatus(0, '2026-11-06', START);
    expect(s.startDate).toBe('2026-11-06');
    expect(s.endDate).toBe('2036-11-07');
  });

  it('moves the whole window when the first sprint moves', () => {
    // 2027-03-01 plus 3,654 days. A day later than the plain ten-year mark,
    // because this window catches three leap days (2028, 2032, 2036) and the
    // run is 3,655 days rather than 3,653.
    const s = longGameStatus(0, '2027-03-01', '2027-03-01');
    expect(s.startDate).toBe('2027-03-01');
    expect(s.endDate).toBe('2037-03-02');
    expect(s.daysElapsed).toBe(1);
  });

  it('has not begun at all when no sprint has a start date', () => {
    const s = longGameStatus(0, '2026-11-06', null);
    expect(s.startDate).toBeNull();
    expect(s.endDate).toBeNull();
    expect(s.started).toBe(false);
    expect(s.daysElapsed).toBe(0);
    expect(s.timeProgress).toBe(0);
    expect(s.projectedEnd).toBeNull();
  });

  it('is a touch over ten years, because the rate is rounded to the dollar', () => {
    expect(LONG_GAME_DAYS / 365.25).toBeGreaterThan(10);
    expect(LONG_GAME_DAYS / 365.25).toBeLessThan(10.05);
  });
});

describe('time', () => {
  it('counts today as elapsed, so day one is not zero', () => {
    const s = longGameStatus(0, '2026-11-06', START);
    expect(s.daysElapsed).toBe(1);
    expect(s.daysLeft).toBe(3_654);
  });

  it('is all zeros before it opens', () => {
    const s = longGameStatus(0, '2026-11-05', START);
    expect(s.started).toBe(false);
    expect(s.daysElapsed).toBe(0);
    expect(s.timeProgress).toBe(0);
  });

  it('caps at the full run rather than running past it', () => {
    const s = longGameStatus(0, '2040-01-01', START);
    expect(s.daysElapsed).toBe(LONG_GAME_DAYS);
    expect(s.daysLeft).toBe(0);
    expect(s.timeProgress).toBe(1);
  });
});

describe('the pace line', () => {
  it('is the target straight-lined across the decade', () => {
    const s = longGameStatus(0, '2026-11-06', START);
    expect(s.paceCents).toBe(Math.round(LONG_GAME_TARGET_CENTS / LONG_GAME_DAYS)); // ~$269
  });

  it('says how far ahead of the market’s shadow you are', () => {
    const s = longGameStatus(100_000, '2026-11-06', START); // $1,000 on day one
    expect(s.aheadCents).toBe(100_000 - s.paceCents);
    expect(s.aheadCents).toBeGreaterThan(0);
  });

  it('reads negative on an unlogged day, which is not a failure', () => {
    expect(longGameStatus(0, '2026-11-06', START).aheadCents).toBeLessThan(0);
  });

  it('stops at the target rather than climbing past it', () => {
    expect(longGameStatus(0, '2040-01-01', START).paceCents).toBe(LONG_GAME_TARGET_CENTS);
  });
});

describe('what it takes from here', () => {
  it('spreads what is left over the days that remain', () => {
    const s = longGameStatus(0, '2026-11-06', START);
    expect(s.requiredDailyCents).toBe(Math.ceil(98_300_000 / 3_654));
  });

  it('asks for less once you are ahead', () => {
    const behind = longGameStatus(0, '2027-11-06', START).requiredDailyCents!;
    const ahead = longGameStatus(20_000_000, '2027-11-06', START).requiredDailyCents!;
    expect(ahead).toBeLessThan(behind);
  });

  it('asks for nothing once the target is passed', () => {
    const s = longGameStatus(98_300_000, '2027-11-06', START);
    expect(s.requiredDailyCents).toBeNull();
    expect(s.achieved).toBe(true);
    expect(s.remainingCents).toBe(0);
  });
});

describe('the projection', () => {
  it('lands within a day of the end date when the pace is exactly right', () => {
    // A year in, holding $269.01 a day. Not exactly the end date, because the
    // earnings are whole cents: rounding a year of them loses a fraction of a
    // day's worth, which pushes the projection one day out. A projection built
    // from real logged amounts is always approximate in this way, and a day in
    // ten years is the right amount of precision to claim.
    const days = 366;
    const earned = Math.round((LONG_GAME_TARGET_CENTS / LONG_GAME_DAYS) * days);
    const s = longGameStatus(earned, '2027-11-06', START);
    expect(s.daysElapsed).toBe(days);
    expect(Math.abs(daysBetween(END, s.projectedEnd!))).toBeLessThanOrEqual(1);
  });

  it('pulls the finish earlier when you are running hot', () => {
    const s = longGameStatus(40_000_000, '2027-11-06', START); // $400k in a year
    expect(s.projectedEnd! < END).toBe(true);
  });

  it('pushes the finish out when you are behind', () => {
    const s = longGameStatus(1_000_000, '2027-11-06', START); // $10k in a year
    expect(s.projectedEnd! > END).toBe(true);
  });

  it('refuses to project from nothing', () => {
    expect(longGameStatus(0, '2027-11-06', START).projectedEnd).toBeNull();
    expect(longGameStatus(0, '2026-11-05', START).actualDailyCents).toBeNull();
  });

  it('projects from a loss as nothing rather than a date in the past', () => {
    // A net-negative run has no finish line to project; saying so beats
    // printing a date that already happened.
    expect(longGameStatus(-500_000, '2027-11-06', START).projectedEnd).toBeNull();
  });
});
