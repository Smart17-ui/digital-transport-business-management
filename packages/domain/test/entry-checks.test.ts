import { describe, expect, it } from 'vitest';
import {
  assertAmountWithinLimit,
  correctionWarning,
  costWarning,
  dailyTermWarning,
  endReadingWarning,
  handoverWarning,
  MAX_AMOUNT_NGWEE,
  startReadingWarning,
  takingsWarning,
} from '../src/index.ts';

describe('odometer warnings', () => {
  it('catches the extra digit that really happened: 455,550 to 4,555,000', () => {
    expect(endReadingWarning(455_550, 4_555_000)).toBe('This means the bus drove 4,099,450 km today. You entered 4,555,000 km.');
  });

  it('accepts an ordinary day and asks about a day with no driving', () => {
    expect(endReadingWarning(455_550, 455_800)).toBeNull();
    expect(endReadingWarning(455_550, 455_550)).toBe('This means the bus did not move today.');
  });

  it('compares a start reading with where the bus last stopped', () => {
    expect(startReadingWarning(4_442_370, 4_442_370)).toBeNull();
    expect(startReadingWarning(4_442_500, 4_442_370)).toBeNull();
    expect(startReadingWarning(455_550, 4_442_370)).toContain('lower than the last reading of 4,442,370 km');
    expect(startReadingWarning(4_442_370, 455_550)).toContain('more than the last reading');
  });

  it('has nothing to compare on a first day', () => {
    expect(startReadingWarning(1000, null)).toBeNull();
  });
});

describe('money warnings', () => {
  it('leaves ordinary amounts alone', () => {
    expect(takingsWarning(200_000)).toBeNull();
    expect(handoverWarning(100_000, 200_000)).toBeNull();
    expect(costWarning(50_000, 40)).toBeNull();
    expect(dailyTermWarning(200_000)).toBeNull();
    expect(correctionWarning(30_000, 20_000)).toBeNull();
  });

  it('asks about an extra zero', () => {
    expect(takingsWarning(2_000_000)).toBe('K20,000 is a lot of takings for one entry.');
    expect(costWarning(1_000_000, null)).toBe('K10,000 is a large cost.');
    expect(dailyTermWarning(2_000_000)).toBe('K20,000 is a large amount for one day.');
    expect(correctionWarning(200_000, 20_000)).toBe('This changes K200 to K2,000.');
  });

  it('asks when more cash is given than the driver should hold', () => {
    expect(handoverWarning(300_000, 200_000)).toBe('You are giving K3,000, but you should only have K2,000 from today.');
    expect(handoverWarning(100_000, -50_000)).toContain('only have K0');
  });

  it('asks about litres no tank could hold', () => {
    expect(costWarning(50_000, 4000)).toContain('4,000 litres');
  });
});

describe('assertAmountWithinLimit', () => {
  it('refuses more than K1,000,000 in one entry', () => {
    expect(() => assertAmountWithinLimit(MAX_AMOUNT_NGWEE)).not.toThrow();
    expect(() => assertAmountWithinLimit(MAX_AMOUNT_NGWEE + 1)).toThrow('amount.too_large');
  });
});
