// 13-week program structure. Weeks pair into fortnights (1,2)(3,4)(5,6)(7,8)(9,10)(11,12);
// week 13 stands alone.

export interface WeekPlan {
  weekNumber: number;
  /** Fortnight index 1-6, or null for week 13. */
  fortnight: number | null;
  phaseLabel: string;
  strengthCount: number;
  /**
   * Prescribed aerobic sessions. The spec's "2-3x/wk" range for weeks 1-8 is
   * implemented as 2 prescribed sessions + unlimited athlete-added extras.
   */
  aerobicCount: number;
  powerEnduranceCount: number;
}

/** Fortnight (1-6) containing a program week, or null for week 13. */
export function fortnightOfWeek(weekNumber: number): number | null {
  if (weekNumber < 1 || weekNumber > 12) return null;
  return Math.ceil(weekNumber / 2);
}

export function weeksOfFortnight(fortnight: number): [number, number] {
  return [fortnight * 2 - 1, fortnight * 2];
}

/** Strength runs weeks 1-10 => fortnights 1-5. */
export const LAST_STRENGTH_FORTNIGHT = 5;
/** Aerobic runs weeks 1-12 => fortnights 1-6. */
export const LAST_AEROBIC_FORTNIGHT = 6;

export function weekHasStrength(weekNumber: number): boolean {
  return weekNumber >= 1 && weekNumber <= 10;
}

export function phaseLabelFor(weekNumber: number): string {
  if (weekNumber <= 8) return 'Strength + Aerobic';
  if (weekNumber <= 10) return 'Strength + Aerobic + Power Endurance';
  if (weekNumber <= 12) return 'Power Endurance + Aerobic';
  return 'Deload';
}

export function generateProgram(): WeekPlan[] {
  const weeks: WeekPlan[] = [];
  for (let w = 1; w <= 13; w++) {
    weeks.push({
      weekNumber: w,
      fortnight: fortnightOfWeek(w),
      phaseLabel: phaseLabelFor(w),
      strengthCount: weekHasStrength(w) ? 1 : 0,
      aerobicCount: w <= 8 ? 2 : w <= 12 ? 1 : 0,
      powerEnduranceCount: w <= 8 ? 0 : w <= 10 ? 1 : w <= 12 ? 2 : 0,
    });
  }
  return weeks;
}
