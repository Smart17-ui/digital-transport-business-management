import type { Arrangement } from '../arrangement/index.ts';
import { invariant } from '../errors.ts';
import type { TripDay } from '../ledger/trip-day.ts';
import { assertPositive, sum, type Ngwee } from '../money.ts';

export type WhoOwesWhom = 'driver_owes_owner' | 'owner_owes_driver' | 'nobody';

export interface SettlementStatement {
  tripDayId: string;
  grossIncome: Ngwee;
  expensesBorneByOwner: Ngwee;
  expensesBorneByDriver: Ngwee;
  targetApplies: boolean;
  ownerShare: Ngwee;
  driverShare: Ngwee;
  /** Cash the Owner already has from this day, less what the Owner funded. */
  ownerNetCash: Ngwee;
  /** What this day alone leaves owing. Positive: the Driver owes the Owner. */
  owedForDay: Ngwee;
  arrearsBroughtForward: Ngwee;
  /** owedForDay plus arrears brought forward. Positive: the Driver owes the Owner. */
  netBalance: Ngwee;
  whoOwesWhom: WhoOwesWhom;
  amountOwed: Ngwee;
  /** True while the day is open, an entry is unconfirmed or an expense is pending. */
  provisional: boolean;
  unconfirmedIncomeIds: string[];
  pendingExpenseIds: string[];
}

export interface SettlementOptions {
  targetApplies: boolean;
  /** Positive: the Driver owes the Owner from earlier days. */
  arrearsBroughtForward: Ngwee;
}

/**
 * UC16: applies the arrangement strategy to the day and works out who owes
 * whom. Pure, so the app runs it offline for provisional totals and the server
 * runs it for the real statement.
 *
 * The Owner should end the day holding ownerShare. The Owner already holds
 * whatever was handed over to them, less whatever they paid for, so the
 * difference is what the Driver still owes (or is owed).
 */
export function calculateSettlement(
  day: TripDay,
  arrangement: Arrangement,
  options: SettlementOptions,
): SettlementStatement {
  const grossIncome = day.confirmedIncome();
  const expensesBorneByOwner = day.approvedExpensesBorneBy('owner');
  const expensesBorneByDriver = day.approvedExpensesBorneBy('driver');
  const { ownerShare, driverShare } = arrangement.split({
    grossIncome,
    ownerBorneExpenses: expensesBorneByOwner,
    driverBorneExpenses: expensesBorneByDriver,
    targetApplies: options.targetApplies,
  });
  invariant(
    ownerShare + driverShare === grossIncome - expensesBorneByOwner - expensesBorneByDriver,
    'settlement.split_does_not_balance',
  );

  const ownerNetCash = day.confirmedReceivedByOwner() - day.approvedExpensesFundedByOwner();
  const owedForDay = ownerShare - ownerNetCash;
  const netBalance = owedForDay + options.arrearsBroughtForward;
  const unconfirmedIncomeIds = day.unconfirmedIncome().map((e) => e.id);
  const pendingExpenseIds = day.pendingExpenses().map((e) => e.id);

  return {
    tripDayId: day.id,
    grossIncome,
    expensesBorneByOwner,
    expensesBorneByDriver,
    targetApplies: options.targetApplies,
    ownerShare,
    driverShare,
    ownerNetCash,
    owedForDay,
    arrearsBroughtForward: options.arrearsBroughtForward,
    netBalance,
    ...direction(netBalance),
    provisional: day.status === 'open' || unconfirmedIncomeIds.length > 0 || pendingExpenseIds.length > 0,
    unconfirmedIncomeIds,
    pendingExpenseIds,
  };
}

export type PaymentParty = 'driver' | 'owner';
export type PaymentStatus = 'claimed' | 'confirmed' | 'rejected';

export interface SettlementPayment {
  id: string;
  tripDayId: string;
  payer: PaymentParty;
  amount: Ngwee;
  method: string;
  status: PaymentStatus;
  /** What the payee confirmed receiving; may be less than claimed (UC17 4a). */
  confirmedAmount: Ngwee | null;
}

export type SettlementState = 'nothing_owed' | 'unpaid' | 'claimed' | 'part_paid' | 'settled';

export interface PaymentPosition {
  /** Confirmed payments, signed: positive when the Driver paid the Owner. */
  paid: Ngwee;
  /** Still owed after confirmed payments; carried forward as arrears. */
  remaining: Ngwee;
  state: SettlementState;
}

export function signedPayment(payment: SettlementPayment): Ngwee {
  if (payment.status !== 'confirmed') return 0;
  const amount = payment.confirmedAmount ?? 0;
  return payment.payer === 'driver' ? amount : -amount;
}

/** UC17: applies confirmed payments to a statement's balance. */
export function paymentPosition(netBalance: Ngwee, payments: readonly SettlementPayment[]): PaymentPosition {
  const paid = sum(payments.map(signedPayment));
  const remaining = netBalance - paid;
  let state: SettlementState;
  if (netBalance === 0 && paid === 0) state = 'nothing_owed';
  else if (remaining === 0) state = 'settled';
  else if (paid !== 0) state = 'part_paid';
  else if (payments.some((p) => p.status === 'claimed')) state = 'claimed';
  else state = 'unpaid';
  return { paid, remaining, state };
}

/** UC17 step 2: only the side that owes can claim a payment, up to what it owes. */
export function validatePaymentClaim(remaining: Ngwee, payer: PaymentParty, amount: Ngwee): void {
  assertPositive(amount, 'payment.amount_not_positive');
  invariant(remaining !== 0, 'payment.nothing_owed');
  invariant(payer === (remaining > 0 ? 'driver' : 'owner'), 'payment.wrong_payer');
  invariant(amount <= Math.abs(remaining), 'payment.more_than_owed');
}

/** UC17 step 4: the payee confirms some or all of a claimed payment. */
export function validatePaymentConfirmation(payment: SettlementPayment, confirmedAmount: Ngwee): void {
  invariant(payment.status === 'claimed', 'payment.already_decided');
  assertPositive(confirmedAmount, 'payment.amount_not_positive');
  invariant(confirmedAmount <= payment.amount, 'payment.confirmed_more_than_claimed');
}

/**
 * Arrears are derived, never stored as a running balance: the sum over earlier
 * days of what each day left owing less what was paid against it.
 */
export function arrearsFrom(days: readonly { owedForDay: Ngwee; paid: Ngwee }[]): Ngwee {
  return sum(days.map((d) => d.owedForDay - d.paid));
}

function direction(balance: Ngwee): { whoOwesWhom: WhoOwesWhom; amountOwed: Ngwee } {
  if (balance > 0) return { whoOwesWhom: 'driver_owes_owner', amountOwed: balance };
  if (balance < 0) return { whoOwesWhom: 'owner_owes_driver', amountOwed: -balance };
  return { whoOwesWhom: 'nobody', amountOwed: 0 };
}
