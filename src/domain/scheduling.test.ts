import { describe, expect, it } from 'vitest';
import { validatePlacement, type Placement } from './scheduling';
import type { SessionType } from './types';

let n = 0;
function p(date: string, type: SessionType, isExtra = false): Placement {
  return { id: `s${++n}`, date, type, isExtra };
}

// Week under test: Mon 2026-08-17 .. Sun 2026-08-23.
// Previous Sunday: 2026-08-16. Next Monday: 2026-08-24.

describe('rule 1 — strength needs a full rest day immediately before', () => {
  it('blocks strength placed the day after an aerobic session', () => {
    const res = validatePlacement([p('2026-08-18', 'aerobic')], p('2026-08-19', 'strength'));
    expect(res.ok).toBe(false);
    expect(res.blocks[0]).toMatch(/rest day/i);
  });

  it('blocks strength on Monday when aerobic sits on the PREVIOUS Sunday (cross-week)', () => {
    const res = validatePlacement([], p('2026-08-17', 'strength'), {
      adjacentPlacements: [p('2026-08-16', 'aerobic')],
    });
    expect(res.ok).toBe(false);
    expect(res.blocks[0]).toMatch(/rest day/i);
  });

  it('blocks dropping aerobic onto the day before an already-placed strength session', () => {
    const res = validatePlacement([p('2026-08-20', 'strength')], p('2026-08-19', 'aerobic'));
    expect(res.ok).toBe(false);
    expect(res.blocks[0]).toMatch(/next day/i);
  });

  it('cross-week, other direction: Sunday aerobic blocked when NEXT Monday has strength', () => {
    const res = validatePlacement([], p('2026-08-23', 'aerobic'), {
      adjacentPlacements: [p('2026-08-24', 'strength')],
    });
    expect(res.ok).toBe(false);
  });

  it('allows strength after a genuinely empty day', () => {
    const res = validatePlacement([p('2026-08-17', 'aerobic')], p('2026-08-19', 'strength'));
    expect(res.ok).toBe(true);
  });

  it('PE and easy climbing also violate the rest-day rule', () => {
    expect(
      validatePlacement([p('2026-08-18', 'power_endurance')], p('2026-08-19', 'strength')).ok,
    ).toBe(false);
    expect(
      validatePlacement([p('2026-08-18', 'easy_climbing')], p('2026-08-19', 'strength')).ok,
    ).toBe(false);
  });
});

describe('rule 2 — aerobic straight after strength is encouraged', () => {
  it('surfaces a positive hint, not a warning or block', () => {
    const res = validatePlacement([p('2026-08-18', 'strength')], p('2026-08-19', 'aerobic'));
    expect(res.ok).toBe(true);
    expect(res.blocks).toHaveLength(0);
    expect(res.hints[0]).toMatch(/recovery/i);
  });

  it('hints when strength is dropped with aerobic already on the next day', () => {
    // aerobic Tue, drop strength Mon (Sunday before is empty)
    const res = validatePlacement([p('2026-08-18', 'aerobic')], p('2026-08-17', 'strength'));
    expect(res.ok).toBe(true);
    expect(res.hints.length).toBeGreaterThan(0);
  });
});

describe('rule 3 — max 3 consecutive climbing days', () => {
  it('3 climbing days then a 4th → blocked', () => {
    const existing = [
      p('2026-08-17', 'aerobic'),
      p('2026-08-18', 'aerobic'),
      p('2026-08-19', 'power_endurance'),
    ];
    const res = validatePlacement(existing, p('2026-08-20', 'aerobic'));
    expect(res.ok).toBe(false);
    expect(res.blocks[0]).toMatch(/3 consecutive/);
  });

  it('3 days, rest, then more → allowed', () => {
    const existing = [
      p('2026-08-17', 'aerobic'),
      p('2026-08-18', 'aerobic'),
      p('2026-08-19', 'power_endurance'),
    ];
    const res = validatePlacement(existing, p('2026-08-21', 'aerobic'));
    expect(res.ok).toBe(true);
  });

  it('two sessions on the same day count as ONE climbing day', () => {
    const existing = [
      p('2026-08-17', 'aerobic'),
      p('2026-08-17', 'power_endurance'), // same day
      p('2026-08-18', 'aerobic'),
    ];
    // only 2 distinct climbing days so far → a 3rd consecutive is fine
    const res = validatePlacement(existing, p('2026-08-19', 'aerobic'));
    expect(res.ok).toBe(true);
  });

  it('filling a gap that bridges two runs into 4+ days → blocked', () => {
    const existing = [
      p('2026-08-17', 'aerobic'),
      p('2026-08-18', 'aerobic'),
      p('2026-08-20', 'aerobic'),
      p('2026-08-21', 'aerobic'),
    ];
    const res = validatePlacement(existing, p('2026-08-19', 'aerobic'));
    expect(res.ok).toBe(false);
    expect(res.blocks[0]).toMatch(/5 climbing days/);
  });

  it('the consecutive window crosses week boundaries', () => {
    const res = validatePlacement(
      [p('2026-08-17', 'aerobic'), p('2026-08-18', 'aerobic')],
      p('2026-08-16', 'aerobic'), // previous-week Sunday would start a 4-day run? no — 3 days: 16,17,18 → ok
      { adjacentPlacements: [p('2026-08-15', 'aerobic')] }, // …but Saturday makes it 4
    );
    expect(res.ok).toBe(false);
  });
});

describe('rule 5 — extra strength sessions are blocked outright', () => {
  it('blocks an extra strength session even on a perfectly rested day', () => {
    const res = validatePlacement([], p('2026-08-19', 'strength', true));
    expect(res.ok).toBe(false);
    expect(res.blocks[0]).toMatch(/finger loading is fixed/i);
  });
});

describe('re-drags', () => {
  it('ignores the candidate\'s own previous placement when moving a session', () => {
    const strength: Placement = { id: 'move-me', date: '2026-08-18', type: 'strength' };
    // moving it Tue→Thu; Wed is empty either way
    const res = validatePlacement([strength], { ...strength, date: '2026-08-20' });
    expect(res.ok).toBe(true);
  });
});
