import { invariant } from './errors.ts';
import { formatKwacha, MAX_AMOUNT_NGWEE } from './money.ts';

/**
 * Typed numbers go into permanent records, and one extra zero looks just as valid
 * as the right figure. Limits refuse what cannot be true. Warnings only ask "is
 * this right?", because an unusual number can still be real and a driver with a
 * broken odometer must not be stuck.
 */
const LONGEST_DAY_KM = 800;
const LONGEST_GAP_KM = 500;
const LARGE_ENTRY_NGWEE = 1_000_000;
const LARGE_COST_NGWEE = 500_000;
const LARGE_DAILY_TERM_NGWEE = 1_000_000;
const MOST_LITRES = 300;
const CORRECTION_FACTOR = 10;

const km = (value: number) => `${value.toLocaleString('en-US')} km`;
const money = (ngwee: number) => `K${formatKwacha(ngwee).replace(/^K/, '').replace(/\.00$/, '')}`;

export function assertAmountWithinLimit(ngwee: number): void {
  invariant(ngwee <= MAX_AMOUNT_NGWEE, 'amount.too_large');
}

/** `lastReading` is where this bus's last finished day ended, if known. */
export function startReadingWarning(reading: number, lastReading: number | null): string | null {
  if (lastReading === null) return null;
  if (reading < lastReading) return `This is lower than the last reading of ${km(lastReading)}. You entered ${km(reading)}.`;
  if (reading - lastReading > LONGEST_GAP_KM) {
    return `This is ${km(reading - lastReading)} more than the last reading of ${km(lastReading)}. You entered ${km(reading)}.`;
  }
  return null;
}

export function endReadingWarning(start: number, end: number): string | null {
  const driven = end - start;
  if (driven === 0) return 'This means the bus did not move today.';
  if (driven > LONGEST_DAY_KM) return `This means the bus drove ${km(driven)} today. You entered ${km(end)}.`;
  return null;
}

export function takingsWarning(ngwee: number): string | null {
  return ngwee > LARGE_ENTRY_NGWEE ? `${money(ngwee)} is a lot of takings for one entry.` : null;
}

/** `cashInHand` is what the driver should be holding, if known. */
export function handoverWarning(ngwee: number, cashInHand: number | null): string | null {
  if (cashInHand !== null && ngwee > cashInHand) {
    return `You are giving ${money(ngwee)}, but you should only have ${money(Math.max(0, cashInHand))} from today.`;
  }
  return ngwee > LARGE_ENTRY_NGWEE ? `${money(ngwee)} is a lot of cash for one handover.` : null;
}

export function costWarning(ngwee: number, litres: number | null): string | null {
  if (litres !== null && litres > MOST_LITRES) return `${litres.toLocaleString('en-US')} litres is more than a bus tank holds.`;
  return ngwee > LARGE_COST_NGWEE ? `${money(ngwee)} is a large cost.` : null;
}

export function correctionWarning(ngwee: number, original: number): string | null {
  if (original > 0 && ngwee >= original * CORRECTION_FACTOR) return `This changes ${money(original)} to ${money(ngwee)}.`;
  return null;
}

/** For the daily amount in an offer: a target, a wage or a payment. */
export function dailyTermWarning(ngwee: number): string | null {
  return ngwee > LARGE_DAILY_TERM_NGWEE ? `${money(ngwee)} is a large amount for one day.` : null;
}
