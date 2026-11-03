import { describe, expect, it } from 'vitest';
import { formatKwacha, parseKwacha, parsePercent, share } from '../src/index.ts';

describe('money', () => {
  it('parses percentages exactly into basis points', () => {
    expect(parsePercent('60')).toBe(6_000);
    expect(parsePercent('62.5')).toBe(6_250);
    expect(parsePercent('0.07')).toBe(7);
    expect(parsePercent(' 100% ')).toBe(10_000);
    expect(parsePercent('0')).toBe(0);
  });

  it('rejects percentages that are malformed or above 100', () => {
    expect(() => parsePercent('100.01')).toThrow('money.invalid_percent');
    expect(() => parsePercent('101')).toThrow('money.invalid_percent');
    expect(() => parsePercent('-5')).toThrow('money.invalid_percent');
    expect(() => parsePercent('12.345')).toThrow('money.invalid_percent');
    expect(() => parsePercent('')).toThrow('money.invalid_percent');
  });

  it('parses kwacha input exactly into ngwee', () => {
    expect(parseKwacha('150')).toBe(15_000);
    expect(parseKwacha('150.5')).toBe(15_050);
    expect(parseKwacha('K1,250.75')).toBe(125_075);
    expect(parseKwacha('0.07')).toBe(7);
  });

  it('rejects malformed amounts', () => {
    expect(() => parseKwacha('12.345')).toThrow('money.invalid');
    expect(() => parseKwacha('abc')).toThrow('money.invalid');
    expect(() => parseKwacha('')).toThrow('money.invalid');
  });

  it('formats ngwee as kwacha', () => {
    expect(formatKwacha(125_050)).toBe('K1,250.50');
    expect(formatKwacha(-7)).toBe('-K0.07');
  });

  it('rounds shares down so parts never exceed the whole', () => {
    expect(share(101, 5_000)).toBe(50);
    expect(() => share(100, 10_001)).toThrow();
  });
});
