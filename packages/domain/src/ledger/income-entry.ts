import { DomainError, invariant } from '../errors.ts';
import { assertPositive, type Ngwee } from '../money.ts';

/** Stored as data so mobile money can be added in Stage 2 without a migration. */
export type PaymentMethod = string;
export const STAGE_1_PAYMENT_METHODS: readonly PaymentMethod[] = ['cash'];

export type PartyKind = 'conductor' | 'driver' | 'owner';
/** Someone who gave or received cash. A Conductor has no account in Stage 1. */
export interface Party {
  kind: PartyKind;
  userId: string | null;
}

/**
 * takings: fares collected, received by whoever now holds the cash.
 * remittance: cash the Driver passes to the Owner during the day.
 */
export type HandoverKind = 'takings' | 'remittance';
export type EntrySource = 'app' | 'correction';
export type EntryStatus = 'pending' | 'confirmed' | 'disputed';

export interface IncomeEntry {
  id: string;
  tripDayId: string;
  kind: HandoverKind;
  /** Negative only on a reversing entry created by a correction (UC10). */
  amount: Ngwee;
  method: PaymentMethod;
  giver: Party;
  receiver: Party;
  recordedBy: string;
  source: EntrySource;
  /** Arrived after its day closed (UC9 5b); counted, but flagged for the Owner. */
  late: boolean;
  reversesId: string | null;
  replacesId: string | null;
  status: EntryStatus;
}

export interface NewHandover {
  id: string;
  kind: HandoverKind;
  amount: Ngwee;
  method: PaymentMethod;
  giver: Party;
  receiver: Party;
  recordedBy: string;
}

/** Default giver and receiver from roles (UC8 step 4). */
export function defaultParties(kind: HandoverKind): { giver: PartyKind; receiver: PartyKind } {
  return kind === 'takings'
    ? { giver: 'conductor', receiver: 'driver' }
    : { giver: 'driver', receiver: 'owner' };
}

export function validateHandover(input: NewHandover, allowedMethods: readonly PaymentMethod[]): void {
  assertPositive(input.amount, 'handover.amount_not_positive');
  invariant(allowedMethods.includes(input.method), 'handover.method_not_available');
  invariant(input.giver.kind !== input.receiver.kind, 'handover.same_party');
  if (input.kind === 'remittance') {
    invariant(
      input.giver.kind === 'driver' && input.receiver.kind === 'owner',
      'handover.remittance_parties',
      'A remittance goes from the Driver to the Owner',
    );
  } else {
    invariant(input.receiver.kind !== 'conductor', 'handover.takings_receiver');
  }
}

/**
 * Who may confirm an entry: a different person from the recorder who is
 * either a named party or the business Owner. In Version 0 the Driver records
 * for the Conductor, so the Owner confirms those takings.
 */
export function canConfirm(entry: IncomeEntry, actorId: string, ownerId: string): boolean {
  if (actorId === entry.recordedBy) return false;
  return actorId === ownerId || actorId === entry.giver.userId || actorId === entry.receiver.userId;
}

export function assertCanDecide(entry: IncomeEntry, actorId: string, ownerId: string): void {
  if (entry.status !== 'pending') throw new DomainError('entry.already_decided');
  if (!canConfirm(entry, actorId, ownerId)) throw new DomainError('entry.not_allowed_to_confirm');
}
