// All dates in the domain layer are ISO `YYYY-MM-DD` strings; arithmetic is done
// in UTC so results never depend on the device timezone. Weeks run Monday-Sunday.

export type ISODate = string;

export function toUtc(date: ISODate): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function fromUtc(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / 86_400_000);
}

/** Monday of the week containing `date`. */
export function mondayOf(date: ISODate): ISODate {
  const dow = toUtc(date).getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/** Program week number (1-13) for a date, or null if outside the program window. */
export function weekNumberFor(programStartMonday: ISODate, date: ISODate): number | null {
  const week = Math.floor(diffDays(date, programStartMonday) / 7) + 1;
  return week >= 1 && week <= 13 ? week : null;
}

/** Monday of a given program week (1-13). */
export function mondayOfWeek(programStartMonday: ISODate, weekNumber: number): ISODate {
  return addDays(programStartMonday, (weekNumber - 1) * 7);
}

export function todayISO(): ISODate {
  const now = new Date();
  // local calendar date (athletes think in local days), formatted as ISO
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}
