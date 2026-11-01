import { share, type Ngwee } from '../money.ts';
import { fixedAmountSplit, type Arrangement, type Split, type SplitInput } from './arrangement.ts';

// Terms are placeholders until pilot owners are interviewed (Open points,
// "Arrangements and fuel defaults"). Changing a rule touches one class here.

/** The Driver owes the Owner a fixed amount each working day and keeps the rest. */
export class FixedTargetArrangement implements Arrangement {
  readonly type = 'fixed_target';
  constructor(readonly terms: { dailyTarget: Ngwee }) {}

  split(input: SplitInput): Split {
    return fixedAmountSplit(input, 'owner', this.terms.dailyTarget);
  }
}

/** Gross takings are shared by percentage; each side then bears its own costs. */
export class RevenueShareArrangement implements Arrangement {
  readonly type = 'revenue_share';
  constructor(readonly terms: { ownerShareBasisPoints: number }) {}

  split(input: SplitInput): Split {
    const ownerCut = share(input.grossIncome, this.terms.ownerShareBasisPoints);
    return {
      ownerShare: ownerCut - input.ownerBorneExpenses,
      driverShare: input.grossIncome - ownerCut - input.driverBorneExpenses,
    };
  }
}

/** All takings belong to the Owner; the Driver is owed the agreed daily pay (UC16 3a). */
export class SalaryArrangement implements Arrangement {
  readonly type = 'salary';
  constructor(readonly terms: { dailyPay: Ngwee }) {}

  split(input: SplitInput): Split {
    return fixedAmountSplit(input, 'driver', this.terms.dailyPay);
  }
}

/**
 * The Driver pays a fixed amount each working day towards buying the vehicle.
 * Daily maths match a fixed target; progress towards totalPrice is reported
 * separately.
 */
export class RentToOwnArrangement implements Arrangement {
  readonly type = 'rent_to_own';
  constructor(readonly terms: { dailyPayment: Ngwee; totalPrice: Ngwee }) {}

  split(input: SplitInput): Split {
    return fixedAmountSplit(input, 'owner', this.terms.dailyPayment);
  }
}
