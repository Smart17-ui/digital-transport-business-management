export const MIN_PASSWORD_LENGTH = 8;

const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', 'password', 'password1', 'qwerty123',
  'qwertyuiop', 'abcd1234', 'iloveyou', 'zambia123', 'lusaka123', 'transport', 'digitaltransport',
]);

export type PasswordProblem = 'too_short' | 'too_common' | 'matches_phone';

/**
 * Simple rules for people typing on a small phone, often in a hurry: length and
 * no obvious choices, rather than demanding symbols. The phone number is compared
 * by its last nine digits, so 0971234567 and 260971234567 count as the same.
 */
export function passwordProblem(password: string, phone: string | null): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too_short';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || new Set(lower).size === 1) return 'too_common';
  const number = phone?.replace(/\D/g, '').slice(-9);
  if (number && password.replace(/\D/g, '').endsWith(number)) return 'matches_phone';
  return null;
}
