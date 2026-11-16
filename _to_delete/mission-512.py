"""Rebase the mission to $512/day, Mon 14 Sep 2026 - Sun 31 Dec 2028.

Run from the repo root. Targets the repo's current $1,430/$300,300 state.
"""
import io, re, sys

def patch(path, subs):
    s = io.open(path, encoding='utf-8').read()
    missing = []
    for a, b in subs:
        if a in s:
            s = s.replace(a, b, 1)
        else:
            missing.append(a.split('\n')[0][:70])
    io.open(path, 'w', encoding='utf-8').write(s)
    print(f'{path}: applied {len(subs)-len(missing)}/{len(subs)}')
    for m in missing:
        print('   MISSING:', m)
    return not missing

ok = True

# ---------------------------------------------------------------- mission.ts
p = 'src/lib/derive/mission.ts'
s = io.open(p, encoding='utf-8').read()
head = '''/**
 * The mission, in two horizons.
 *
 * THE LONG GAME is fixed: $512 a day from 14 September 2026 to 31 December
 * 2028. That is 840 days and $430,080. It never moves. It is the thing being
 * aimed at.
 *
 * The window picked itself. 31 December 2028 falls on a Sunday — it is both
 * the last Sunday of that year and the last day of it — and 14 September 2026
 * is a Monday, so the run closes on New Year's Eve with nothing of 2028 left
 * over and no reserve day needed to make the weeks divide. 840 days is exactly
 * 120 of them.
 *
 * THE WEEK is not fixed. Each week runs Monday to Sunday, and its goal is
 * recomputed when the previous one closes: whatever is left of the $430,080,
 * spread over the days left to earn it, times the days in this week. Beat a
 * week and next week's number falls. Miss one and it rises. The long game
 * absorbs the difference either way, which is the whole point of splitting
 * them — a fixed weekly target would either drift out of contact with the goal
 * or quietly forgive a bad week, and this does neither.
 *
 * Week one therefore opens at exactly $3,584, because 840 days at $512 spread
 * over the first seven is the rate itself. Every week after that is whatever
 * the ones before it left behind.
 *
 * Recalibration spreads by DAY rather than by week, which keeps the arithmetic
 * honest if the window ever changes shape again.
 */

'''
s = head + s[s.index('import type { MissionDay }'):]
io.open(p, 'w', encoding='utf-8').write(s)
print(f'{p}: header rewritten')

ok &= patch(p, [
    ("export const MISSION_START = '2026-08-17';",
     "export const MISSION_START = '2026-09-14';"),
    ("/** A Sunday — the last day that owes anything. */\nexport const MISSION_END = '2027-03-14';",
     "/** The last Sunday of 2028, and the last day of it. */\nexport const MISSION_END = '2028-12-31';"),
    ("export const MISSION_DAYS = daysBetween(MISSION_START, MISSION_END) + 1; // 210",
     "export const MISSION_DAYS = daysBetween(MISSION_START, MISSION_END) + 1; // 840"),
    ("/** 30 whole Monday-to-Sunday weeks, with nothing left over. */\nexport const MISSION_WEEKS = Math.ceil(MISSION_DAYS / 7); // 30",
     "/** 120 whole Monday-to-Sunday weeks, with nothing left over. */\nexport const MISSION_WEEKS = Math.ceil(MISSION_DAYS / 7); // 120"),
    ("/** $1,430 a day — $10,010 a week — every day, for the whole run. */\nexport const MISSION_DAILY_CENTS = 143_000;",
     "/** $512 a day — $3,584 a week — every day, for the whole run. */\nexport const MISSION_DAILY_CENTS = 51_200;"),
    ("/** $300,300 — 210 days at $1,430. The one figure in here that never changes. */",
     "/** $430,080 — 840 days at $512. The one figure in here that never changes. */"),
    ("/** 1-based, 1..30. */", "/** 1-based, 1..120. */"),
    ("/** Days of the whole window gone, including today. Capped at 210. */",
     "/** Days of the whole window gone, including today. Capped at 840. */"),
    ("   * How much of the 210 days has gone. 0..1.",
     "   * How much of the 840 days has gone. 0..1."),
    ("/** Still to earn to reach $300,300. Zero once it is passed. */",
     "/** Still to earn to reach $430,080. Zero once it is passed. */"),
    ("/** The pace the whole thing opened at: $1,430 x 7 = $10,010 a week. */",
     "/** The pace the whole thing opened at: $512 x 7 = $3,584 a week. */"),
    (" * short, and 30 of those add up.", " * short, and 120 of those add up."),
    (" * All 30 weeks, each with the goal it was given and what it earned.",
     " * All 120 weeks, each with the goal it was given and what it earned."),
])

# ------------------------------------------------------- MissionSection.tsx
ok &= patch('src/components/MissionSection.tsx', [
    ("'The mission starts Mon 17 Aug 2026'", "'The mission starts Mon 14 Sep 2026'"),
    ("""/**
 * All 30 weeks as a strip.
 *
 * One mark per week rather than per day: across seven months a day is noise,
 * and what matters is the rhythm of weeks kept and weeks dropped. Fifteen
 * columns puts the whole run in two rows of roughly a quarter each, and keeps
 * each square big enough to aim a cursor at.
 */""",
     """/**
 * All 120 weeks as a strip.
 *
 * One mark per week rather than per day: across two and a third years a day is
 * noise, and what matters is the rhythm of weeks kept and weeks dropped.
 * Thirty columns puts the whole run in four rows of thirty weeks — near enough
 * a row per seven months, and each square stays big enough to aim a cursor at.
 */"""),
    ("style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}",
     "style={{ gridTemplateColumns: 'repeat(30, minmax(0, 1fr))' }}"),
])

# ------------------------------------------------------------ mission.test.ts
p = 'src/lib/derive/mission.test.ts'
ok &= patch(p, [
    ("it('runs Mon 17 Aug 2026 to Sun 14 Mar 2027', () => {",
     "it('runs Mon 14 Sep 2026 to Sun 31 Dec 2028', () => {"),
    ("expect(MISSION_END).toBe('2027-03-14');", "expect(MISSION_END).toBe('2028-12-31');"),
    ("  it('is 210 days — exactly 30 whole weeks', () => {\n    expect(MISSION_DAYS).toBe(210);\n    expect(MISSION_WEEKS).toBe(30);",
     "  it('is 840 days — exactly 120 whole weeks', () => {\n    expect(MISSION_DAYS).toBe(840);\n    expect(MISSION_WEEKS).toBe(120);"),
    ("  it('targets $300,300 — 210 days at $1,430', () => {\n    expect(MISSION_DAILY_CENTS).toBe(143_000);\n    expect(MISSION_TARGET_CENTS).toBe(30_030_000);",
     "  it('targets $430,080 — 840 days at $512', () => {\n    expect(MISSION_DAILY_CENTS).toBe(51_200);\n    expect(MISSION_TARGET_CENTS).toBe(43_008_000);"),
    # The target is no longer chosen to clear a round number, so that test is
    # replaced by the property that actually made this window: the end date.
    ("""  it('clears the $300,000 it was aimed at, with room to spare', () => {
    // The rate came first — $10,010 a week — and the window was cut to the
    // first whole week that clears $300,000. Thirty weeks does it, by $300.
    expect(MISSION_TARGET_CENTS).toBeGreaterThan(30_000_000);
    expect(MISSION_TARGET_CENTS - 30_000_000).toBe(30_000);
  });""",
     """  it('ends on the last Sunday of 2028, which is also the last day of it', () => {
    // 31 December 2028 falls on a Sunday. Nothing of 2028 sits outside the
    // window, and no reserve day is needed to make the weeks divide.
    expect(MISSION_END).toBe('2028-12-31');
    expect(dow(MISSION_END)).toBe(0);
    expect(MISSION_END.slice(0, 4)).toBe('2028');
  });"""),
    ("  it('is exactly $10,010 — seven days at $1,430, no rounding needed', () => {",
     "  it('is exactly $3,584 — seven days at $512, no rounding needed', () => {"),
    ("expect(w.goalCents).toBe(1_001_000);", "expect(w.goalCents).toBe(358_400);"),
    ("""    // Week one earns nothing; the $10,010 owed is spread across the 203 days
    // that are left, then multiplied back up by this week's seven.""",
     """    // Week one earns nothing; the $3,584 owed is spread across the 833 days
    // that are left, then multiplied back up by this week's seven."""),
    ("expect(weeks[1].goalCents).toBe(Math.ceil((30_030_000 / 203) * 7));",
     "expect(weeks[1].goalCents).toBe(Math.ceil((43_008_000 / 833) * 7));"),
    ("expect(w.remainingCents).toBe(1_001_000 - 30_000);",
     "expect(w.remainingCents).toBe(358_400 - 30_000);"),
    # $5,000 clears a $3,584 week, so the "beats its goal" cases go back to 5000
    ("const weeks = weeksOf([day('2026-08-17', 15000)], '2026-08-25'); // into week two\n    expect(weeks[0].earnedCents).toBe(1_500_000);",
     "const weeks = weeksOf([day('2026-08-17', 5000)], '2026-08-25'); // into week two\n    expect(weeks[0].earnedCents).toBe(500_000);"),
    ("const weeks = weeksOf([day('2026-08-17', 15000)], '2026-08-25');\n    expect(weeks[1].perDayCents).toBe(Math.ceil(weeks[1].goalCents / 7));",
     "const weeks = weeksOf([day('2026-08-17', 5000)], '2026-08-25');\n    expect(weeks[1].perDayCents).toBe(Math.ceil(weeks[1].goalCents / 7));"),
    ("const s = status([day('2026-08-17', 15000), day('2026-08-24', 1)], '2026-09-01');",
     "const s = status([day('2026-08-17', 5000), day('2026-08-24', 1)], '2026-09-01');"),
    # one day must now out-earn $430,080 to close the whole thing out
    ("const weeks = weeksOf([day('2026-08-17', 400000)], '2026-08-25');",
     "const weeks = weeksOf([day('2026-08-17', 500000)], '2026-08-25');"),
    ("  it('tracks the long game against $300,300', () => {",
     "  it('tracks the long game against $430,080', () => {"),
    ("expect(s.remainingCents).toBe(29_530_000);", "expect(s.remainingCents).toBe(42_508_000);"),
    ("expect(s.progress).toBeCloseTo(500_000 / 30_030_000, 10);",
     "expect(s.progress).toBeCloseTo(500_000 / 43_008_000, 10);"),
    ("  it('opens at $10,010 a week', () => {\n    expect(status([], '2026-08-17').openingWeeklyCents).toBe(1_001_000);",
     "  it('opens at $3,584 a week', () => {\n    expect(status([], '2026-08-17').openingWeeklyCents).toBe(358_400);"),
    ("  it('tracks the window from day one to day 210', () => {",
     "  it('tracks the window from day one to day 840', () => {"),
    ("expect(status([], MISSION_END).daysElapsed).toBe(210);",
     "expect(status([], MISSION_END).daysElapsed).toBe(840);"),
    ("expect(currentWeek(weeksOf([], '2027-03-15'), '2027-03-15')).toBeNull();",
     "expect(currentWeek(weeksOf([], '2029-01-01'), '2029-01-01')).toBeNull();"),
    ("const s = status([], '2027-03-15');", "const s = status([], '2029-01-01');"),
])

# Every date literal in the tests is anchored to the old 17 Aug start. Shift
# the lot four weeks later in ONE pass so no mapping chains into another.
SHIFT = {
    '2026-08-16': '2026-09-13', '2026-08-17': '2026-09-14', '2026-08-18': '2026-09-15',
    '2026-08-19': '2026-09-16', '2026-08-20': '2026-09-17', '2026-08-21': '2026-09-18',
    '2026-08-22': '2026-09-19', '2026-08-23': '2026-09-20', '2026-08-24': '2026-09-21',
    '2026-08-25': '2026-09-22', '2026-09-01': '2026-09-29',
}
s = io.open(p, encoding='utf-8').read()
s = re.sub(r'2026-0[89]-\d\d', lambda m: SHIFT.get(m.group(0), m.group(0)), s)
io.open(p, 'w', encoding='utf-8').write(s)
print(f'{p}: dates shifted to the 14 Sep anchor')

print('\nALL CLEAN' if ok else '\nSOME SUBSTITUTIONS MISSED — check above')
sys.exit(0 if ok else 1)
