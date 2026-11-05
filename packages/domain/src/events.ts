/**
 * Domain events, written to the outbox in the same transaction as the change
 * they describe (UC29 step 1). Subscribers never get called by the code that
 * caused the change.
 */
export const EVENT_TYPES = [
  'ArrangementProposed',
  'ArrangementAccepted',
  'ArrangementDeclined',
  'ArrangementEnded',
  'DayStarted',
  'DayClosed',
  'DayReported',
  'DayReportAccepted',
  'DayReportRejected',
  'HandoverRecorded',
  'HandoverConfirmed',
  'HandoverDisputed',
  'ExpenseLogged',
  'ExpenseApproved',
  'ExpenseRejected',
  'EntryCorrected',
  'PaymentClaimed',
  'PaymentConfirmed',
  'PaymentDisputed',
  'PaymentReversed',
  'MemberJoined',
  'MemberRemoved',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface DomainEvent {
  type: EventType;
  businessId: string;
  /** Who caused it; they are never notified about their own action. */
  actorId: string;
  /** The user on the other side, when there is one (the Driver of a day, an invitee). */
  subjectUserId: string | null;
  entityId: string;
  /** Screen the notification opens (UC29 step 6). */
  link: string;
  /** Unsafe defects and similar; may fall back to SMS from Version 1. */
  critical: boolean;
  /** Never shown in a push message: no amounts or document numbers leave the inbox. */
  data: Record<string, unknown>;
}

/** Notification categories a user can mute in Version 1 (UC31). */
export function categoryOf(type: EventType): string {
  if (type.startsWith('Arrangement') || type.startsWith('Member')) return 'crew';
  if (type.startsWith('Day')) return 'day';
  if (type.startsWith('Payment')) return 'settlement';
  return 'ledger';
}
