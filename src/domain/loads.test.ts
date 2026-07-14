import { describe, expect, it } from 'vitest';
import { displayWeight, roundHalfKg, trainingLoadFromMvc } from './loads';

describe('training load derivation', () => {
  it('is 90% of TOTAL MVC load (bw + added), not of added weight', () => {
    // bw 70 + 30 added = 100 total → training 90, NOT 70 + 0.9*30 = 97
    expect(trainingLoadFromMvc(100)).toBe(90);
  });

  it('stays unrounded (rounding is display-only)', () => {
    expect(trainingLoadFromMvc(101)).toBeCloseTo(90.9, 10);
  });
});

describe('display rounding', () => {
  it('rounds to the nearest 0.5 kg', () => {
    expect(roundHalfKg(90.9)).toBe(91);
    expect(roundHalfKg(90.7)).toBe(90.5);
    expect(roundHalfKg(90.24)).toBe(90);
  });
});

describe('displayed added weight', () => {
  it('positive difference → added weight', () => {
    expect(displayWeight(91.2, 72)).toEqual({ mode: 'added', kg: 19 });
  });

  it('negative difference → assisted/pulley figure, never a negative number', () => {
    const w = displayWeight(65, 72.4);
    expect(w.mode).toBe('assisted');
    expect(w.kg).toBe(7.5);
    expect(w.kg).toBeGreaterThan(0);
  });

  it('a hair under bodyweight rounds to added 0, not assisted 0', () => {
    expect(displayWeight(71.9, 72)).toEqual({ mode: 'added', kg: 0 });
  });
});
