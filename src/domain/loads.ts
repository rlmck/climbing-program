import { TRAINING_LOAD_FACTOR } from './constants';

/** Training load = 90% of MVC TOTAL load (bw + added), not of added weight. Unrounded. */
export function trainingLoadFromMvc(mvcTotalLoadKg: number): number {
  return mvcTotalLoadKg * TRAINING_LOAD_FACTOR;
}

/** Display rounding only — stored values stay unrounded. */
export function roundHalfKg(kg: number): number {
  return Math.round(kg * 2) / 2;
}

export interface DisplayWeight {
  /** 'added' = weight on the belt/pin; 'assisted' = pulley/band take-off. */
  mode: 'added' | 'assisted';
  /** Always >= 0, rounded to 0.5 kg. */
  kg: number;
}

/**
 * What the athlete physically sets up for a session: training load minus current
 * bodyweight. Negative values are shown as assistance, never as a negative number.
 */
export function displayWeight(trainingLoadKg: number, bodyweightKg: number): DisplayWeight {
  const added = trainingLoadKg - bodyweightKg;
  const rounded = roundHalfKg(Math.abs(added));
  // -0.2kg rounds to 0 — call that 'added 0', not 'assisted 0'
  if (added < 0 && rounded > 0) return { mode: 'assisted', kg: rounded };
  return { mode: 'added', kg: rounded };
}

export function formatKg(kg: number): string {
  const r = roundHalfKg(kg);
  return Number.isInteger(r) ? `${r} kg` : `${r.toFixed(1)} kg`;
}
