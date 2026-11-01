import type { Bearer, CostTerms } from '../arrangement/index.ts';
import { DomainError, invariant } from '../errors.ts';
import { assertPositive, ngwee, type Ngwee } from '../money.ts';

/** Expense categories are stored as data; each belongs to one of these kinds. */
export type ExpenseKind = 'fuel' | 'roadside' | 'owner_paid';
export type PaidBy = 'driver_cash' | 'advance' | 'owner';
export type ExpenseStatus = 'pending' | 'approved' | 'declined';

/**
 * State pattern: only a pending expense can be decided, so approving a
 * declined expense is impossible rather than merely checked for.
 */
export interface ExpenseState {
  readonly status: ExpenseStatus;
  /** The amount that counts in the settlement; null unless approved. */
  readonly approvedAmount: Ngwee | null;
  approve(amount: Ngwee, requested: Ngwee): ExpenseState;
  decline(reason: string): ExpenseState;
}

export class PendingState implements ExpenseState {
  readonly status = 'pending';
  readonly approvedAmount = null;

  approve(amount: Ngwee, requested: Ngwee): ExpenseState {
    ngwee(amount);
    // A reversal carries a negative amount and is approved in full.
    if (requested < 0) {
      invariant(amount === requested, 'expense.invalid_approved_amount');
    } else {
      invariant(amount > 0 && amount <= requested, 'expense.invalid_approved_amount');
    }
    return new ApprovedState(amount);
  }

  decline(reason: string): ExpenseState {
    invariant(reason.trim().length > 0, 'expense.decline_reason_required');
    return new DeclinedState(reason.trim());
  }
}

export class ApprovedState implements ExpenseState {
  readonly status = 'approved';
  constructor(readonly approvedAmount: Ngwee) {}
  approve(): ExpenseState {
    throw new DomainError('expense.already_decided');
  }
  decline(): ExpenseState {
    throw new DomainError('expense.already_decided');
  }
}

export class DeclinedState implements ExpenseState {
  readonly status = 'declined';
  readonly approvedAmount = null;
  constructor(readonly reason: string) {}
  approve(): ExpenseState {
    throw new DomainError('expense.already_decided');
  }
  decline(): ExpenseState {
    throw new DomainError('expense.already_decided');
  }
}

export function expenseStateFrom(
  status: ExpenseStatus,
  approvedAmount: Ngwee | null,
  reason: string | null,
): ExpenseState {
  switch (status) {
    case 'pending':
      return new PendingState();
    case 'approved':
      return new ApprovedState(approvedAmount ?? 0);
    case 'declined':
      return new DeclinedState(reason ?? '');
  }
}

export interface Expense {
  id: string;
  tripDayId: string | null;
  vehicleId: string;
  category: string;
  kind: ExpenseKind;
  /** Negative only on a reversing entry created by a correction (UC10). */
  amount: Ngwee;
  litres: number | null;
  paidBy: PaidBy;
  borneBy: Bearer;
  note: string;
  receiptPath: string | null;
  recordedBy: string;
  late: boolean;
  reversesId: string | null;
  replacesId: string | null;
  state: ExpenseState;
}

export interface NewExpense {
  id: string;
  vehicleId: string;
  category: string;
  kind: ExpenseKind;
  amount: Ngwee;
  litres: number | null;
  paidBy: PaidBy;
  note: string;
  receiptPath: string | null;
  recordedBy: string;
  /** Only the Owner may set this, for example a fine borne by the Driver (UC12 5a). */
  borneByOverride: Bearer | null;
}

export function validateExpense(input: NewExpense): void {
  assertPositive(input.amount, 'expense.amount_not_positive');
  if (input.litres !== null) {
    invariant(input.litres > 0, 'expense.litres_not_positive');
    invariant(input.kind === 'fuel', 'expense.litres_only_for_fuel');
  }
  invariant(input.note.length <= 500, 'expense.note_too_long');
}

/** Who bears a cost by default, from the arrangement's cost terms (UC12 step 5). */
export function defaultBearer(kind: ExpenseKind, costs: CostTerms): Bearer {
  switch (kind) {
    case 'fuel':
      return costs.fuelBearer;
    case 'roadside':
      return costs.otherCostsBearer;
    case 'owner_paid':
      return 'owner';
  }
}
