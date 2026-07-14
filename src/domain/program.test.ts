import { describe, expect, it } from 'vitest';
import { fortnightOfWeek, generateProgram, weekHasStrength } from './program';
import { addDays, mondayOf, weekNumberFor } from './dates';

describe('program generation', () => {
  const program = generateProgram();

  it('creates exactly 13 weeks', () => {
    expect(program).toHaveLength(13);
  });

  it('prescribes strength 1x/wk in weeks 1-10 and none after', () => {
    for (const w of program) {
      expect(w.strengthCount).toBe(w.weekNumber <= 10 ? 1 : 0);
    }
  });

  it('aerobic: 2/wk weeks 1-8, 1/wk weeks 9-12, none prescribed week 13', () => {
    expect(program[0].aerobicCount).toBe(2);
    expect(program[7].aerobicCount).toBe(2);
    expect(program[8].aerobicCount).toBe(1);
    expect(program[11].aerobicCount).toBe(1);
    expect(program[12].aerobicCount).toBe(0);
  });

  it('PE: none before week 9, 1/wk weeks 9-10, 2/wk weeks 11-12, none week 13', () => {
    expect(program[7].powerEnduranceCount).toBe(0);
    expect(program[8].powerEnduranceCount).toBe(1);
    expect(program[9].powerEnduranceCount).toBe(1);
    expect(program[10].powerEnduranceCount).toBe(2);
    expect(program[11].powerEnduranceCount).toBe(2);
    expect(program[12].powerEnduranceCount).toBe(0);
  });

  it('pairs weeks into fortnights, week 13 standalone', () => {
    expect(fortnightOfWeek(1)).toBe(1);
    expect(fortnightOfWeek(2)).toBe(1);
    expect(fortnightOfWeek(9)).toBe(5);
    expect(fortnightOfWeek(12)).toBe(6);
    expect(fortnightOfWeek(13)).toBeNull();
  });

  it('strength exists weeks 1-10 only', () => {
    expect(weekHasStrength(10)).toBe(true);
    expect(weekHasStrength(11)).toBe(false);
  });
});

describe('date helpers', () => {
  it('weeks run Monday-Sunday', () => {
    expect(mondayOf('2026-08-19')).toBe('2026-08-17'); // Wednesday → Monday
    expect(mondayOf('2026-08-23')).toBe('2026-08-17'); // Sunday → same week's Monday
    expect(mondayOf('2026-08-17')).toBe('2026-08-17'); // Monday → itself
  });

  it('maps dates to program weeks and returns null outside the window', () => {
    const start = '2026-08-17';
    expect(weekNumberFor(start, '2026-08-17')).toBe(1);
    expect(weekNumberFor(start, '2026-08-23')).toBe(1);
    expect(weekNumberFor(start, '2026-08-24')).toBe(2);
    expect(weekNumberFor(start, addDays(start, 12 * 7))).toBe(13);
    expect(weekNumberFor(start, addDays(start, 13 * 7))).toBeNull();
    expect(weekNumberFor(start, '2026-08-16')).toBeNull();
  });
});
