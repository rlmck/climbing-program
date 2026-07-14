import type { Grip, Hand } from './types';
import { HAND_LABEL } from './types';

// Defensive parser for Critical Force Test JSON exports. Unknown extra keys are
// ignored; only structurally required fields are validated. rawReadings are
// deliberately stripped from the parsed result (they stay in the raw file in
// Storage) so charts and Postgres rows stay small.

export interface CftRep {
  rep: number;
  average: number | null;
  minimum: number | null;
  peak: number | null;
  unreliable: boolean;
}

export interface CftSummary {
  bodyweight: number | null;
  hand: Hand | null;
  criticalForce: number;
  cfMin: number | null;
  cfRatio: number | null;
  arcZone: string | null;
  thresholdZone: string | null;
  unreliableReps: number[];
  reps: CftRep[];
}

export interface CftSlot {
  grip: Grip;
  hand: Hand;
}

export interface CftParseResult {
  ok: boolean;
  summary: CftSummary | null;
  /** Fatal problems — the file must be rejected. */
  errors: string[];
  /** Non-fatal problems — the file is accepted but the athlete should check. */
  warnings: string[];
}

function asFiniteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asHand(v: unknown): Hand | null {
  return v === 'left' || v === 'right' ? v : null;
}

/**
 * Parse one CFT file's text against the slot (grip + hand) the athlete assigned
 * it to. Grip is NEVER inferred from the file — the JSON only carries `hand`,
 * which is used purely to warn on a slot mismatch.
 */
export function parseCftFile(text: string, slot: CftSlot): CftParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, summary: null, errors: ['Not valid JSON — is this the right file?'], warnings };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, summary: null, errors: ['JSON root must be an object.'], warnings };
  }
  const obj = raw as Record<string, unknown>;

  const criticalForce = asFiniteNumber(obj.criticalForce);
  if (criticalForce === null) {
    errors.push('Missing `criticalForce` — this does not look like a completed CFT export.');
  }

  const allReps = obj.allReps;
  if (!Array.isArray(allReps) || allReps.length === 0) {
    errors.push('`allReps` is missing or empty — no rep data to plot.');
  }

  if (errors.length > 0) return { ok: false, summary: null, errors, warnings };

  const unreliableFromList = Array.isArray(obj.unreliableReps)
    ? (obj.unreliableReps as unknown[]).filter((n): n is number => typeof n === 'number')
    : [];

  const reps: CftRep[] = (allReps as unknown[])
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r, i) => {
      const repNumber = asFiniteNumber(r.rep) ?? i + 1;
      return {
        rep: repNumber,
        average: asFiniteNumber(r.average),
        minimum: asFiniteNumber(r.minimum),
        peak: asFiniteNumber(r.peak),
        unreliable: r.unreliable === true || unreliableFromList.includes(repNumber),
        // rawReadings intentionally dropped
      };
    });

  if (reps.length === 0) {
    return {
      ok: false,
      summary: null,
      errors: ['`allReps` contains no readable rep objects.'],
      warnings,
    };
  }

  const fileHand = asHand(obj.hand);
  if (fileHand === null) {
    warnings.push('File has no readable `hand` field — make sure it is in the right slot.');
  } else if (fileHand !== slot.hand) {
    warnings.push(
      `This file says it is a ${HAND_LABEL[fileHand].toLowerCase()}-hand test, but you put it in the ` +
        `${HAND_LABEL[slot.hand].toLowerCase()}-hand slot. Double-check before saving.`,
    );
  }

  return {
    ok: true,
    summary: {
      bodyweight: asFiniteNumber(obj.bodyweight),
      hand: fileHand,
      criticalForce: criticalForce as number,
      cfMin: asFiniteNumber(obj.cfMin),
      cfRatio: asFiniteNumber(obj.cfRatio),
      arcZone: asString(obj.arcZone),
      thresholdZone: asString(obj.thresholdZone),
      unreliableReps: unreliableFromList,
      reps,
    },
    errors,
    warnings,
  };
}
