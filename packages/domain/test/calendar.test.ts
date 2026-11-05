import { describe, expect, it } from 'vitest';
import { addDays, markForDate, mondayOf, monthWeeks } from '../src/index.ts';

describe('mondayOf', () => {
  it('finds the Monday of the week, which runs Monday to Sunday', () => {
    expect(mondayOf('2026-11-02')).toBe('2026-11-02'); // a Monday
    expect(mondayOf('2026-11-04')).toBe('2026-11-02');
    expect(mondayOf('2026-11-08')).toBe('2026-11-02'); // the Sunday after it
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
  });

  it('crosses months and years', () => {
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
    expect(mondayOf('2027-01-01')).toBe('2026-12-28');
    expect(addDays('2026-12-28', 6)).toBe('2027-01-03');
  });
});

describe('monthWeeks', () => {
  it('starts weeks on Monday and fills the blanks', () => {
    // 1 November 2026 is a Sunday, so it sits last in the first week.
    const weeks = monthWeeks(2026, 11);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks[1]![0]).toBe('2026-11-02');
    expect(weeks[weeks.length - 1]).toEqual(['2026-11-30', null, null, null, null, null, null]);
  });

  it('handles a leap February', () => {
    expect(monthWeeks(2028, 2).flat().filter(Boolean)).toHaveLength(29);
  });
});

describe('markForDate', () => {
  it('shows nothing for a date with no record', () => {
    expect(markForDate({ daysLeft: [], reportStatuses: [] })).toBe('none');
  });

  it('shows a worked day as paid or owed', () => {
    expect(markForDate({ daysLeft: [0], reportStatuses: [] })).toBe('paid');
    expect(markForDate({ daysLeft: [20_000], reportStatuses: [] })).toBe('owed');
  });

  it('shows an accepted report, including a sick day with no work at all', () => {
    expect(markForDate({ daysLeft: [], reportStatuses: ['accepted'] })).toBe('excused');
    expect(markForDate({ daysLeft: [0], reportStatuses: ['accepted'] })).toBe('excused');
  });

  it('puts a report still waiting first', () => {
    expect(markForDate({ daysLeft: [20_000], reportStatuses: ['pending'] })).toBe('waiting');
  });

  it('does not excuse a date whose report was rejected', () => {
    expect(markForDate({ daysLeft: [20_000], reportStatuses: ['rejected'] })).toBe('owed');
    expect(markForDate({ daysLeft: [], reportStatuses: ['rejected'] })).toBe('none');
  });
});
