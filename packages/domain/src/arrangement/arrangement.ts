import type { Ngwee } from '../money.ts';

export const ARRANGEMENT_TYPES = ['fixed_target', 'revenue_share', 'salary', 'rent_to_own'] as const;
export type ArrangementType = (typeof ARRANGEMENT_TYPES)[number];

export type Bearer = 'owner' | 'driver';

export interface SplitInput {
  /** Confirmed takings for the day. */
  grossIncome: Ngwee;
  /** Approved expenses the Owner bears, whoever paid them. */
  ownerBorneExpenses: Ngwee;
  /** Approved expenses the Driver bears, whoever paid them. */
  driverBorneExpenses: Ngwee;
  /** False on an off-road day (UC7): no daily target or fixed amount applies. */
  targetApplies: boolean;
}

/**
 * Each side's position for the day, net of the expenses it bears.
 *
 * Liskov rule for every Arrangement: ownerShare + driverShare equals
 * grossIncome - ownerBorneExpenses - driverBorneExpenses. A negative share
 * means that side ends the day behind (for example a target shortfall).
 */
export interface Split {
  ownerShare: Ngwee;
  driverShare: Ngwee;
}

/** Strategy: how a day's money is divided between Owner and Driver. */
export interface Arrangement {
  readonly type: ArrangementType;
  split(input: SplitInput): Split;
}

/**
 * Splits the day when one side is due a fixed amount and the other keeps the
 * remainder. Shared by fixed target, rent-to-own (Owner due) and salary
 * (Driver due).
 */
export function fixedAmountSplit(input: SplitInput, fixedTo: Bearer, fixedAmount: Ngwee): Split {
  const due = input.targetApplies ? fixedAmount : 0;
  const remainder = input.grossIncome - due;
  return fixedTo === 'owner'
    ? {
        ownerShare: due - input.ownerBorneExpenses,
        driverShare: remainder - input.driverBorneExpenses,
      }
    : {
        ownerShare: remainder - input.ownerBorneExpenses,
        driverShare: due - input.driverBorneExpenses,
      };
}
