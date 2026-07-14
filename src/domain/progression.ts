import type { Grip, GripFailures, SessionStatus } from './types';
import { GRIPS, GRIP_LABEL } from './types';
import {
  LAST_STRENGTH_FORTNIGHT,
  fortnightOfWeek,
  weeksOfFortnight,
} from './program';

// Strength progression engine. Each grip progresses independently: a grip's
// load moves into fortnight N+1 only if EVERY strength session of fortnight N
// (2 prescribed sessions) was logged clean for that grip. Anything else —
// a failed set on that grip, an unlogged session, a missing session — holds.
// Grips never regress. Progression stops entirely at week 11 (no strength in
// fortnight 6 or week 13).

export interface StrengthSessionLog {
  weekNumber: number;
  status: SessionStatus;
  gripFailures: GripFailures | null;
}

/** Strength sessions prescribed per fortnight (1x/wk x 2 weeks). */
export const STRENGTH_SESSIONS_PER_FORTNIGHT = 2;

/** Was this grip held clean for all 4 sets in this session? */
export function gripCleanInSession(session: StrengthSessionLog, grip: Grip): boolean {
  if (session.status === 'complete') return true;
  if (session.status === 'failed') {
    // A failed session with no detail for a grip is treated as that grip failing:
    // never progress on ambiguous data.
    return session.gripFailures?.[grip]?.failed === false;
  }
  // unplaced / planned = never logged => not clean
  return false;
}

export interface GripDecision {
  grip: Grip;
  previousLoadKg: number;
  newLoadKg: number;
  progressed: boolean;
  /** Human-readable explanation, persisted to strength_loads.hold_reason when held. */
  reason: string;
}

export interface FortnightDecisionInput {
  /** The fortnight just completed (1-5). */
  completedFortnight: number;
  /** ALL strength sessions belonging to that fortnight's two weeks, logged or not. */
  sessions: StrengthSessionLog[];
  /** Current total load per grip (unrounded). */
  currentLoads: Record<Grip, number>;
  /** Per-athlete increment (athletes.strength_progression_kg). */
  progressionKg: number;
}

/**
 * Decide next-fortnight loads after `completedFortnight`. Returns null when there
 * is no next strength fortnight (i.e. after fortnight 5 — strength stops at week 11).
 */
export function decideProgression(input: FortnightDecisionInput): GripDecision[] | null {
  const { completedFortnight, sessions, currentLoads, progressionKg } = input;
  if (completedFortnight < 1 || completedFortnight >= LAST_STRENGTH_FORTNIGHT + 1) {
    return null;
  }
  if (completedFortnight === LAST_STRENGTH_FORTNIGHT) {
    // Weeks 11-12 have no strength sessions: nothing to progress into.
    return null;
  }

  const [w1, w2] = weeksOfFortnight(completedFortnight);
  const fortnightSessions = sessions.filter(
    (s) => fortnightOfWeek(s.weekNumber) === completedFortnight,
  );

  return GRIPS.map((grip) => {
    const previousLoadKg = currentLoads[grip];
    const cleanCount = fortnightSessions.filter((s) => gripCleanInSession(s, grip)).length;
    const failedWeeks = fortnightSessions
      .filter((s) => s.status === 'failed' && !gripCleanInSession(s, grip))
      .map((s) => s.weekNumber);

    if (cleanCount >= STRENGTH_SESSIONS_PER_FORTNIGHT) {
      return {
        grip,
        previousLoadKg,
        newLoadKg: previousLoadKg + progressionKg,
        progressed: true,
        reason: `${GRIP_LABEL[grip]}: all sets held in both sessions of weeks ${w1}–${w2} → +${progressionKg} kg`,
      };
    }

    const reason =
      failedWeeks.length > 0
        ? `${GRIP_LABEL[grip]}: failed set(s) in week ${failedWeeks.join(' and week ')} → hold`
        : `${GRIP_LABEL[grip]}: ${STRENGTH_SESSIONS_PER_FORTNIGHT - cleanCount} session(s) in weeks ${w1}–${w2} not logged complete → hold`;

    return { grip, previousLoadKg, newLoadKg: previousLoadKg, progressed: false, reason };
  });
}

export interface LoadHistoryEntry {
  fortnight: number;
  grip: Grip;
  loadKg: number;
  progressed: boolean;
  holdReason: string | null;
}

/**
 * Recompute the entire load history from the baseline + session logs.
 * Deterministic and idempotent — safe to run after every logging action and
 * upsert the result. Only fortnights whose sessions could already have been
 * logged are emitted (fortnight N+1 appears once fortnight N exists in logs
 * or unconditionally, since "not logged" = hold — we emit all 5).
 */
export function computeLoadHistory(
  baselineLoads: Record<Grip, number>,
  sessions: StrengthSessionLog[],
  progressionKg: number,
  /** Highest fortnight to compute loads FOR (default: all strength fortnights). */
  upToFortnight: number = LAST_STRENGTH_FORTNIGHT,
): LoadHistoryEntry[] {
  const entries: LoadHistoryEntry[] = [];
  const current: Record<Grip, number> = { ...baselineLoads };

  for (const grip of GRIPS) {
    entries.push({
      fortnight: 1,
      grip,
      loadKg: current[grip],
      progressed: false,
      holdReason: null, // baseline: 90% of MVC
    });
  }

  for (let f = 2; f <= Math.min(upToFortnight, LAST_STRENGTH_FORTNIGHT); f++) {
    const decisions = decideProgression({
      completedFortnight: f - 1,
      sessions,
      currentLoads: current,
      progressionKg,
    });
    if (!decisions) break;
    for (const d of decisions) {
      current[d.grip] = d.newLoadKg;
      entries.push({
        fortnight: f,
        grip: d.grip,
        loadKg: d.newLoadKg,
        progressed: d.progressed,
        holdReason: d.progressed ? null : d.reason,
      });
    }
  }
  return entries;
}
