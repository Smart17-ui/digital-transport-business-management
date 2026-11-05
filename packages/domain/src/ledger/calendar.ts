export type DayMark = 'none' | 'paid' | 'owed' | 'waiting' | 'excused';

/** What one calendar date needs to know to show how it went. */
export interface CalendarInput {
  /** What is still unpaid for each day worked on this date. */
  daysLeft: readonly number[];
  reportStatuses: readonly ('pending' | 'accepted' | 'rejected')[];
}

/** The one thing a date shows. A report still waiting comes first, because someone has to act on it. */
export function markForDate({ daysLeft, reportStatuses }: CalendarInput): DayMark {
  if (reportStatuses.includes('pending')) return 'waiting';
  if (daysLeft.some((left) => left !== 0)) return 'owed';
  if (reportStatuses.includes('accepted')) return 'excused';
  return daysLeft.length > 0 ? 'paid' : 'none';
}

/** Moves a YYYY-MM-DD date by a number of days. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The Monday that starts the week a YYYY-MM-DD date falls in. */
export function mondayOf(date: string): string {
  const sinceMonday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -sinceMonday);
}

/** The dates of a month as Monday-first weeks, as YYYY-MM-DD, with null for the blanks. `month` is 1 to 12. */
export function monthWeeks(year: number, month: number): (string | null)[][] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
