import { describe, expect, it } from 'vitest';
import {
  computeLoadHistory,
  decideProgression,
  gripCleanInSession,
  type StrengthSessionLog,
} from './progression';
import type { Grip } from './types';

const LOADS: Record<Grip, number> = { half_crimp: 90, three_finger_drag: 80 };
const KG = 2.0;

function complete(weekNumber: number): StrengthSessionLog {
  return { weekNumber, status: 'complete', gripFailures: null };
}

function failedGrips(weekNumber: number, failed: Grip[]): StrengthSessionLog {
  return {
    weekNumber,
    status: 'failed',
    gripFailures: {
      half_crimp: { failed: failed.includes('half_crimp') },
      three_finger_drag: { failed: failed.includes('three_finger_drag') },
    },
  };
}

function unlogged(weekNumber: number): StrengthSessionLog {
  return { weekNumber, status: 'planned', gripFailures: null };
}

function decisionFor(decisions: ReturnType<typeof decideProgression>, grip: Grip) {
  const d = decisions?.find((x) => x.grip === grip);
  if (!d) throw new Error(`no decision for ${grip}`);
  return d;
}

describe('strength progression', () => {
  it('both sessions clean → both grips progress by the configured increment', () => {
    const decisions = decideProgression({
      completedFortnight: 1,
      sessions: [complete(1), complete(2)],
      currentLoads: LOADS,
      progressionKg: KG,
    });
    expect(decisionFor(decisions, 'half_crimp')).toMatchObject({ progressed: true, newLoadKg: 92 });
    expect(decisionFor(decisions, 'three_finger_drag')).toMatchObject({ progressed: true, newLoadKg: 82 });
  });

  it('one grip passes, the other fails → only one load moves', () => {
    const decisions = decideProgression({
      completedFortnight: 1,
      sessions: [complete(1), failedGrips(2, ['three_finger_drag'])],
      currentLoads: LOADS,
      progressionKg: KG,
    });
    expect(decisionFor(decisions, 'half_crimp')).toMatchObject({ progressed: true, newLoadKg: 92 });
    const drag = decisionFor(decisions, 'three_finger_drag');
    expect(drag.progressed).toBe(false);
    expect(drag.newLoadKg).toBe(80); // holds, never regresses
    expect(drag.reason).toMatch(/week 2/);
  });

  it('one clean session + one failed session in the fortnight → hold', () => {
    const decisions = decideProgression({
      completedFortnight: 2,
      sessions: [complete(3), failedGrips(4, ['half_crimp', 'three_finger_drag'])],
      currentLoads: LOADS,
      progressionKg: KG,
    });
    expect(decisionFor(decisions, 'half_crimp').progressed).toBe(false);
    expect(decisionFor(decisions, 'three_finger_drag').progressed).toBe(false);
  });

  it('an unlogged session → hold, not progress (silence never progresses)', () => {
    const decisions = decideProgression({
      completedFortnight: 1,
      sessions: [complete(1), unlogged(2)],
      currentLoads: LOADS,
      progressionKg: KG,
    });
    expect(decisionFor(decisions, 'half_crimp').progressed).toBe(false);
    expect(decisionFor(decisions, 'half_crimp').reason).toMatch(/not logged/);
  });

  it('a session missing entirely from the data → hold', () => {
    const decisions = decideProgression({
      completedFortnight: 1,
      sessions: [complete(1)], // week 2 session vanished
      currentLoads: LOADS,
      progressionKg: KG,
    });
    expect(decisionFor(decisions, 'half_crimp').progressed).toBe(false);
  });

  it('failed session with no grip detail → both grips hold (never progress on ambiguity)', () => {
    const decisions = decideProgression({
      completedFortnight: 1,
      sessions: [complete(1), { weekNumber: 2, status: 'failed', gripFailures: null }],
      currentLoads: LOADS,
      progressionKg: KG,
    });
    expect(decisionFor(decisions, 'half_crimp').progressed).toBe(false);
    expect(decisionFor(decisions, 'three_finger_drag').progressed).toBe(false);
  });

  it('set-level ticks are reference only — grip-level flag decides', () => {
    const session: StrengthSessionLog = {
      weekNumber: 1,
      status: 'failed',
      gripFailures: {
        half_crimp: { failed: false, sets: [] },
        three_finger_drag: { failed: true, sets: [3, 4] },
      },
    };
    expect(gripCleanInSession(session, 'half_crimp')).toBe(true);
    expect(gripCleanInSession(session, 'three_finger_drag')).toBe(false);
  });

  it('progression stops entirely at week 11: completing fortnight 5 yields no decision', () => {
    const decisions = decideProgression({
      completedFortnight: 5,
      sessions: [complete(9), complete(10)],
      currentLoads: LOADS,
      progressionKg: KG,
    });
    expect(decisions).toBeNull();
  });

  it('load history: chains fortnights, uses per-athlete increment, records hold reasons', () => {
    const sessions = [
      complete(1), complete(2), // f1 clean → f2 progresses
      complete(3), failedGrips(4, ['half_crimp']), // f2: crimp fails → f3 crimp holds
      // weeks 5+ unlogged → everything holds from f4 on
    ];
    const history = computeLoadHistory(LOADS, sessions, 2.5);
    const crimp = history.filter((h) => h.grip === 'half_crimp').map((h) => h.loadKg);
    const drag = history.filter((h) => h.grip === 'three_finger_drag').map((h) => h.loadKg);
    expect(crimp).toEqual([90, 92.5, 92.5, 92.5, 92.5]);
    expect(drag).toEqual([80, 82.5, 85, 85, 85]);
    const f3crimp = history.find((h) => h.grip === 'half_crimp' && h.fortnight === 3);
    expect(f3crimp?.progressed).toBe(false);
    expect(f3crimp?.holdReason).toMatch(/week 4/);
    expect(history).toHaveLength(10); // 5 fortnights x 2 grips — nothing beyond week 10
  });
});
