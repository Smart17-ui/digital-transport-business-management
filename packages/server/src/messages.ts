import type { EventType } from '@dt/domain';
import type { Message } from './notifications.ts';

/**
 * Push and inbox text. No amounts, names or document numbers: a push can be
 * read on a locked screen. Bemba and Nyanja catalogues are added here by a
 * native speaker; until then those users get English.
 */
export const en: Record<EventType, Message> = {
  ArrangementProposed: { title: 'New arrangement', body: 'Your owner has proposed terms. Open the app to review them.' },
  ArrangementAccepted: { title: 'Arrangement accepted', body: 'Your driver accepted the terms.' },
  ArrangementDeclined: { title: 'Arrangement declined', body: 'Your driver declined the terms. Open the app to see why.' },
  DayStarted: { title: 'Day started', body: 'A driver has started the day.' },
  DayClosed: { title: 'Day closed', body: 'A day has ended. Open the app to see the settlement.' },
  HandoverRecorded: { title: 'Handover to confirm', body: 'A cash handover is waiting for your confirmation.' },
  HandoverConfirmed: { title: 'Handover confirmed', body: 'A handover you recorded was confirmed.' },
  HandoverDisputed: { title: 'Handover disputed', body: 'A handover you recorded was disputed. Open the app.' },
  ExpenseLogged: { title: 'Expense logged', body: 'A new expense was logged. Open the app to review it.' },
  EntryCorrected: { title: 'Entry corrected', body: 'An entry on your day was corrected. Open the app to review it.' },
  PaymentClaimed: { title: 'Payment to confirm', body: 'A settlement payment is waiting for your confirmation.' },
  PaymentConfirmed: { title: 'Payment confirmed', body: 'Your settlement payment was confirmed.' },
  PaymentDisputed: { title: 'Payment disputed', body: 'Your settlement payment was not confirmed. Open the app.' },
  PaymentReversed: { title: 'Payment undone', body: 'A confirmed settlement payment was undone. Open the app to see why.' },
  MemberJoined: { title: 'New crew member', body: 'Someone joined your business with an invite code.' },
  MemberRemoved: {
    title: 'Access removed',
    body: 'You no longer have access to this business. Your own earnings record is still available.',
  },
};

export const catalogues = { en };
