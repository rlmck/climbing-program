/**
 * Default load increase (kg, applied to a grip's TOTAL load) per clean fortnight.
 * This is only the fallback default: the live value is stored per-athlete in
 * athletes.strength_progression_kg so it can be tuned in the DB without a redeploy.
 */
export const STRENGTH_PROGRESSION_KG = 2.0;

/** Training load = 90% of MVC total load (bodyweight + added weight). */
export const TRAINING_LOAD_FACTOR = 0.9;

/** Strength protocol, fixed for every strength session in weeks 1-10. */
export const STRENGTH_PROTOCOL = {
  setsPerGrip: 4,
  repsPerSet: 1,
  hangSeconds: 7,
  restMinutes: 5,
  edgeMm: 20,
} as const;

export const PE_GUIDANCE =
  'Choose 4×4s, linked boulders, or route repeaters. Aim for continuous, sustained effort in the ' +
  '30–90 second range per round/interval — hard enough that pump and fatigue are unavoidable. ' +
  'Rest roughly 3–4× the work duration between rounds. This is the one phase where chasing ' +
  'fatigue is the goal.';

export const WEEK13_GUIDANCE =
  'Very low intensity climbing only — several grades below your max. Go climb easy and enjoy it.';

export const MOBILITY_GUIDANCE =
  'Stretching / mobility work — do it any day you like, even rest days or strength days. ' +
  'It never counts as climbing and never blocks the schedule.';

export const AEROBIC_GUIDANCE =
  'Easy, continuous climbing — no pump, no fatigue-chasing. Pick any venue/format you like ' +
  '(wall, cliff, ARC, mileage…).';
