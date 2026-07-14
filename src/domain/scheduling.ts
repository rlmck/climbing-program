import type { SessionType } from './types';
import { addDays, type ISODate } from './dates';

// Placement validator. Pure function; the app never schedules or reshuffles for
// the athlete — it only accepts or rejects a drop, with reasons.
//
// Rules (1, 3, 5 are hard blocks; rule 2 is a positive hint):
//   1. Strength requires a completely session-free day immediately before it
//      (any placed session counts as climbing; a day with nothing placed = rest).
//      Enforced in both directions: you also can't drop a session onto the day
//      before an existing strength session.
//   2. Aerobic the day after strength is allowed and encouraged (hint).
//   3. Max 3 consecutive climbing days; a 4th is blocked. Multiple sessions on
//      one day count as ONE climbing day.
//   5. Extra strength sessions are blocked outright.
// Rules 1 and 3 cross week boundaries: callers must pass every placement in the
// surrounding window (previous week's tail + next week's head), not just Mon-Sun.

export interface Placement {
  id: string;
  date: ISODate;
  type: SessionType;
  isExtra?: boolean;
}

export interface CandidatePlacement {
  /** Session id — if it already appears in the window it is treated as being moved. */
  id: string;
  date: ISODate;
  type: SessionType;
  isExtra?: boolean;
}

export interface WindowContext {
  /** Placements outside the current week (previous/next week tails). */
  adjacentPlacements?: Placement[];
}

export interface ValidationResult {
  ok: boolean;
  blocks: string[];
  hints: string[];
}

/** Every session type counts as a climbing day for rules 1 and 3. */
function isClimbing(_type: SessionType): boolean {
  return true;
}

export function validatePlacement(
  currentPlacements: Placement[],
  candidate: CandidatePlacement,
  windowContext: WindowContext = {},
): ValidationResult {
  const blocks: string[] = [];
  const hints: string[] = [];

  // Merge current week + surrounding window; drop the candidate's own previous
  // position (re-drags must validate against the board without themselves).
  const others = [...currentPlacements, ...(windowContext.adjacentPlacements ?? [])].filter(
    (p) => p.id !== candidate.id && isClimbing(p.type),
  );

  const dayBefore = addDays(candidate.date, -1);
  const dayAfter = addDays(candidate.date, 1);
  const on = (date: ISODate) => others.filter((p) => p.date === date);

  // Rule 5 — extra strength is blocked unconditionally, no override.
  if (candidate.type === 'strength' && candidate.isExtra) {
    blocks.push(
      'Extra strength sessions are not allowed — finger loading is fixed by the program. ' +
        'Add aerobic volume instead if you want more.',
    );
    return { ok: false, blocks, hints };
  }

  // Rule 1 — strength needs a full rest day immediately before it.
  if (candidate.type === 'strength' && on(dayBefore).length > 0) {
    blocks.push(
      'Strength needs a full rest day immediately before it — there is already a session ' +
        `placed the day before (${dayBefore}). Mobility/stretching is fine; climbing is not.`,
    );
  }
  // Rule 1, other direction — nothing may land the day before an existing strength session.
  const strengthAfter = on(dayAfter).some((p) => p.type === 'strength');
  if (strengthAfter && isClimbing(candidate.type)) {
    blocks.push(
      `Strength is scheduled the next day (${dayAfter}) and needs a full rest day before it — ` +
        'this day must stay session-free.',
    );
  }

  // Rule 3 — max 3 consecutive climbing days. Count unique dates; the candidate
  // may also bridge two existing runs into one.
  const climbingDays = new Set(others.map((p) => p.date));
  climbingDays.add(candidate.date);
  let runLength = 1;
  for (let d = addDays(candidate.date, -1); climbingDays.has(d); d = addDays(d, -1)) runLength++;
  for (let d = addDays(candidate.date, 1); climbingDays.has(d); d = addDays(d, 1)) runLength++;
  if (runLength > 3) {
    blocks.push(
      `That would make ${runLength} climbing days in a row — the limit is 3 consecutive days. ` +
        'Put a rest day in first.',
    );
  }

  // Rule 2 — aerobic straight after strength: allowed and encouraged.
  if (blocks.length === 0) {
    const strengthBefore = on(dayBefore).some((p) => p.type === 'strength');
    if (candidate.type === 'aerobic' && strengthBefore) {
      hints.push('Good — easy aerobic the day after hangs aids recovery.');
    }
    const aerobicAfter = on(dayAfter).some((p) => p.type === 'aerobic');
    if (candidate.type === 'strength' && aerobicAfter) {
      hints.push('Good — you already have aerobic the day after these hangs; that pairing aids recovery.');
    }
  }

  return { ok: blocks.length === 0, blocks, hints };
}
