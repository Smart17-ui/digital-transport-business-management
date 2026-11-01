import { describe, expect, it } from 'vitest';
import { formatKwacha, parseKwacha, share } from '../src/index.ts';

describe('money', () => {
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
