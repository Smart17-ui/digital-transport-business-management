import type { CommandPayload, CommandResult, CommandType } from '@dt/domain';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { supabase } from '@/lib/supabase';

/** A refusal by the server, or `network` when the phone could not reach it. */
export class CommandError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CommandError';
  }
}

export interface OutgoingCommand {
  type: string;
  clientId: string;
  deviceTime: string;
  businessId: string | null;
  payload: unknown;
}

/** Sends commands to the Command API, which applies them in order. Throws if the server cannot be reached. */
export async function sendBatch(commands: OutgoingCommand[], retried = false): Promise<CommandResult[]> {
  const { data, error } = await supabase.functions.invoke<{ results: CommandResult[] }>('command', { body: { commands } });
  if ((error as { context?: { status?: number } } | null)?.context?.status === 401) {
    // Either the token ran out while the app slept, or the session was ended from another phone.
    // Refreshing tells which, and signs this phone out if it was ended. A resend is harmless, thanks to clientId.
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) throw new CommandError(isAuthRetryableFetchError(refreshed.error) ? 'network' : 'session_expired');
    if (!retried) return sendBatch(commands, true);
    throw new CommandError('session_expired');
  }
  if (error || !data?.results) throw new CommandError('network');
  return data.results;
}

/**
 * Sends one command to the Command API. Pass the same clientId when retrying
 * something that may already have worked, so it is only applied once.
 */
export async function sendCommand<T extends CommandType>(
  type: T,
  businessId: string | null,
  payload: CommandPayload<T>,
  clientId: string = randomUUID(),
): Promise<Record<string, unknown>> {
  const [result] = await sendBatch([{ type, clientId, deviceTime: new Date().toISOString(), businessId, payload }]);
  if (!result) throw new CommandError('network');
  if (!result.ok) throw new CommandError(result.code);
  return result.data;
}

const REASONS: Record<string, string> = {
  network: 'Could not reach the server. Check your signal and try again.',
  session_expired: 'You have been signed out. Sign in again. Anything saved on this phone is safe.',
  'invite.invalid_or_expired': 'That invite code is wrong, used or expired. Ask the owner for a new one.',
  'invite.already_member': 'You are already part of this business.',
  'vehicle.plate_taken': 'You already have a bus with this number plate.',
  'vehicle.not_found': 'We could not find that bus.',
  'arrangement.invalid_terms': 'Check the amounts and try again.',
  'arrangement.driver_not_in_business': 'That driver is no longer part of your business.',
  'arrangement.already_decided': 'This offer has already been answered.',
  'arrangement.not_found': 'We could not find this offer.',
  'arrangement.not_yours': 'This offer is for another driver.',
  'day.already_open': 'This bus already has a day running. That day must be ended first.',
  'day.already_closed': 'This day has already been ended.',
  'day.vehicle_off_road': 'This bus is marked as off the road, so a day cannot start on it.',
  'day.vehicle_retired': 'This bus is no longer in use, so a day cannot start on it.',
  'day.no_active_arrangement': 'There is no agreed arrangement for you on this bus on this date. Check the date on your phone.',
  'day.only_driver_starts': 'Only a driver can start a day.',
  'day.invalid_odometer': 'Enter the odometer reading in whole kilometres.',
  'day.end_reading_below_start': 'The end reading cannot be lower than the start reading.',
  'day.not_found': 'We could not find this day. If starting it was also refused, that is why.',
  'handover.amount_not_positive': 'Enter an amount above zero.',
  'handover.method_not_available': 'Only cash can be recorded for now.',
  'report.only_driver_reports': 'Only a driver can report a problem with a day.',
  'report.date_in_future': 'A problem cannot be reported for a date still to come.',
  'report.not_your_bus': 'You do not have an agreement on this bus.',
  'report.already_reported': 'You have already reported a problem for this date.',
  'report.not_found': 'We could not find this report.',
  'report.already_decided': 'This report has already been answered.',
  'report.reason_required': 'Say why you are rejecting this report.',
  'arrangement.bus_in_use': 'This bus has a day running with another driver. Try again once that day has ended.',
  'expense.not_found': 'We could not find this cost.',
  'expense.already_decided': 'This cost has already been answered.',
  'expense.decline_reason_required': 'Say why you are rejecting this cost.',
  'expense.amount_not_positive': 'Enter an amount above zero.',
  'expense.unknown_category': 'That type of cost is not recognised.',
  'expense.litres_not_positive': 'Enter the litres as a number above zero, or leave it empty.',
  'expense.vehicle_mismatch': 'This cost is for a different bus from the day it was recorded on.',
  'entry.not_found': 'We could not find this entry.',
  'entry.already_decided': 'This entry has already been checked.',
  'entry.not_allowed_to_confirm': 'You cannot check an entry you recorded yourself.',
  'payment.day_not_closed': 'A payment can only be recorded once the day has ended.',
  'payment.method_not_available': 'Only cash can be recorded for now.',
  'payment.claim_pending': 'A payment on this day is still waiting to be confirmed.',
  'payment.amount_not_positive': 'Enter an amount above zero.',
  'payment.nothing_owed': 'Nothing is owed on this day.',
  'payment.wrong_payer': 'The other person owes on this day, so they record the payment.',
  'payment.more_than_owed': 'That is more than is owed on this day.',
  'payment.not_found': 'We could not find this payment.',
  'payment.only_payee_decides': 'Only the person being paid can answer this.',
  'payment.already_decided': 'This payment has already been answered.',
  'payment.confirmed_more_than_claimed': 'That is more than the payment recorded.',
  'payment.not_confirmed': 'Only a confirmed payment can be undone.',
  'payment.already_reversed': 'This payment has already been undone.',
  'payment.reason_required': 'Say why this payment is being undone.',
  'correction.reason_required': 'Say why this entry is being corrected.',
  'correction.entry_not_locked': 'Check this entry first, then correct it if it is wrong.',
  'correction.cannot_correct_reversal': 'A correction cannot itself be corrected.',
  'correction.already_corrected': 'This entry has already been corrected.',
  'correction.amount_negative': 'The right amount cannot be below zero.',
  'access.not_your_day': 'This day belongs to another driver.',
  'access.owner_only': 'Only the owner can do this.',
  'access.not_member': 'You are no longer part of this business.',
};

export function reasonForCode(code: string): string {
  return REASONS[code] ?? 'Something went wrong. Please try again.';
}

export function reasonFor(error: unknown): string {
  return reasonForCode(error instanceof CommandError ? error.code : 'network');
}
