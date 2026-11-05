import { describe, expect, it } from 'vitest';
import { passwordProblem } from '../src/index.ts';

describe('passwordProblem', () => {
  it('accepts a reasonable password, with no need for symbols', () => {
    expect(passwordProblem('green bus 42', '260971234567')).toBeNull();
    expect(passwordProblem('mwalimu2026', null)).toBeNull();
  });

  it('needs at least 8 characters', () => {
    expect(passwordProblem('short12', null)).toBe('too_short');
    expect(passwordProblem('longer12', null)).toBeNull();
  });

  it('refuses obvious choices, whatever the capitals', () => {
    expect(passwordProblem('12345678', null)).toBe('too_common');
    expect(passwordProblem('PassWord', null)).toBe('too_common');
    expect(passwordProblem('aaaaaaaaaa', null)).toBe('too_common');
  });

  it('refuses the phone number, written either way', () => {
    expect(passwordProblem('260971234567', '260971234567')).toBe('matches_phone');
    expect(passwordProblem('0971234567', '260971234567')).toBe('matches_phone');
    expect(passwordProblem('0971234567', null)).toBeNull();
  });
});
