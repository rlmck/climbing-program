import { describe, expect, it } from 'vitest';
import { parseCftFile, type CftSlot } from './cft';

const SLOT: CftSlot = { grip: 'half_crimp', hand: 'left' };

function validFile(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    timestamp: '2026-08-17T10:00:00Z',
    bodyweight: 72.4,
    hand: 'left',
    criticalForce: 28.1,
    cfMin: 26.0,
    cfRatio: 0.42,
    arcZone: '20-24kg',
    thresholdZone: '24-28kg',
    cfRepValues: [28, 28.5, 27.9],
    unreliableReps: [12, 13],
    allReps: [
      { rep: 1, average: 44.2, minimum: 39.8, peak: 48.1, unreliable: false, rawReadings: [{ t: 0, force: 0 }] },
      { rep: 12, average: 30.1, minimum: 27.2, peak: 33.0, unreliable: true, rawReadings: [] },
    ],
    ...overrides,
  });
}

describe('CFT parser', () => {
  it('parses a valid file and strips rawReadings', () => {
    const res = parseCftFile(validFile(), SLOT);
    expect(res.ok).toBe(true);
    expect(res.summary?.criticalForce).toBe(28.1);
    expect(res.summary?.cfRatio).toBe(0.42);
    expect(res.summary?.reps).toHaveLength(2);
    expect(res.summary?.reps[0]).not.toHaveProperty('rawReadings');
    expect(res.warnings).toHaveLength(0);
  });

  it('rejects malformed JSON with a clear error', () => {
    const res = parseCftFile('{ not json', SLOT);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/valid JSON/i);
  });

  it('rejects a file with missing allReps', () => {
    const obj = JSON.parse(validFile());
    delete obj.allReps;
    const res = parseCftFile(JSON.stringify(obj), SLOT);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('allReps'))).toBe(true);
  });

  it('rejects empty allReps', () => {
    const res = parseCftFile(validFile({ allReps: [] }), SLOT);
    expect(res.ok).toBe(false);
  });

  it('rejects missing criticalForce', () => {
    const obj = JSON.parse(validFile());
    delete obj.criticalForce;
    const res = parseCftFile(JSON.stringify(obj), SLOT);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('criticalForce'))).toBe(true);
  });

  it('warns (does not reject) when the file hand disagrees with the slot', () => {
    const res = parseCftFile(validFile({ hand: 'right' }), SLOT);
    expect(res.ok).toBe(true);
    expect(res.warnings[0]).toMatch(/right-hand test.*left-hand slot/i);
  });

  it('ignores unknown extra keys instead of erroring', () => {
    const res = parseCftFile(validFile({ someFutureField: { nested: true }, v: 9 }), SLOT);
    expect(res.ok).toBe(true);
  });

  it('flags reps as unreliable from either rep.unreliable or the unreliableReps list', () => {
    const res = parseCftFile(
      validFile({
        unreliableReps: [1],
        allReps: [
          { rep: 1, average: 40, minimum: 38, peak: 42, unreliable: false },
          { rep: 2, average: 39, minimum: 37, peak: 41, unreliable: true },
          { rep: 3, average: 38, minimum: 36, peak: 40, unreliable: false },
        ],
      }),
      SLOT,
    );
    expect(res.summary?.reps.map((r) => r.unreliable)).toEqual([true, true, false]);
  });

  it('tolerates reps with missing numeric fields', () => {
    const res = parseCftFile(
      validFile({ allReps: [{ rep: 1, average: 'oops', unreliable: false }] }),
      SLOT,
    );
    expect(res.ok).toBe(true);
    expect(res.summary?.reps[0].average).toBeNull();
  });
});
