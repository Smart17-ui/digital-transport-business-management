import { DomainError, invariant } from './errors.ts';

/**
 * All money is held as whole ngwee (1 kwacha = 100 ngwee) so arithmetic is
 * exact. Never store or compute kwacha as a float.
 */
export type Ngwee = number;

export function ngwee(value: number): Ngwee {
  invariant(Number.isSafeInteger(value), 'money.not_integer', `Not a whole ngwee amount: ${value}`);
  return value;
}

/** Parses user input such as "150", "150.5" or "1,250.75" kwacha into ngwee. */
export function parseKwacha(input: string): Ngwee {
  const cleaned = input.replace(/[,\s]/g, '').replace(/^K/i, '');
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) throw new DomainError('money.invalid', `Not a kwacha amount: ${input}`);
  const [, sign, whole, fraction = ''] = match;
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return ngwee(sign === '-' ? -value : value);
}

/** Parses a percentage such as "60" or "62.5" into basis points (10000 = 100%). */
export function parsePercent(input: string): number {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?%?$/.exec(input.trim());
  if (!match) throw new DomainError('money.invalid_percent', `Not a percentage: ${input}`);
  const [, whole, fraction = ''] = match;
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  invariant(basisPoints <= 10_000, 'money.invalid_percent', 'Cannot be more than 100%');
  return basisPoints;
}

/** Formats ngwee as kwacha, for example 125050 -> "K1,250.50". */
export function formatKwacha(amount: Ngwee): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}K${whole}.${fraction}`;
}

export function sum(amounts: readonly Ngwee[]): Ngwee {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/**
 * A share of an amount in basis points (10000 = 100%), rounded down so the
 * parts of a split can never exceed the whole.
 */
export function share(amount: Ngwee, basisPoints: number): Ngwee {
  invariant(
    Number.isInteger(basisPoints) && basisPoints >= 0 && basisPoints <= 10_000,
    'money.invalid_basis_points',
  );
  return Math.floor((amount * basisPoints) / 10_000);
}

export function assertPositive(amount: Ngwee, code = 'money.not_positive'): void {
  ngwee(amount);
  invariant(amount > 0, code, 'Amount must be greater than zero');
}
