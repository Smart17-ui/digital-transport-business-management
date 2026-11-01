import {
  DomainError,
  parseCommand,
  type Command,
  type CommandPayload,
  type CommandResult,
  type CommandType,
} from '@dt/domain';
import { buildContext, type CommandContext } from './context.ts';
import { maybeOne, type Database } from './db.ts';
import * as crew from './handlers/crew.ts';
import * as ledger from './handlers/ledger.ts';
import * as payments from './handlers/payments.ts';

type Handler<T extends CommandType> = (ctx: CommandContext, payload: CommandPayload<T>) => Promise<Record<string, unknown>>;

const handlers: { [T in CommandType]: Handler<T> } = {
  create_business: crew.createBusiness,
  create_invite: crew.createInvite,
  join_business: crew.joinBusiness,
  register_vehicle: crew.registerVehicle,
  add_conductor: crew.addConductor,
  propose_arrangement: crew.proposeArrangement,
  respond_arrangement: crew.respondArrangement,
  remove_member: crew.removeMember,
  record_consent: crew.recordConsent,
  set_profile: crew.setProfile,
  register_device: crew.registerDevice,
  start_day: ledger.startDay,
  end_day: ledger.endDay,
  record_handover: ledger.recordHandover,
  decide_handover: ledger.decideHandover,
  log_expense: ledger.logExpense,
  correct_entry: ledger.correctEntry,
  claim_payment: payments.claimPayment,
  decide_payment: payments.decidePayment,
};

/** Unique constraints that mean a rule was broken rather than a server fault. */
const CONSTRAINT_CODES: Record<string, string> = {
  trip_days_one_open_per_vehicle: 'day.already_open',
  vehicles_plate: 'vehicle.plate_taken',
  arrangements_one_active: 'arrangement.already_active',
  entry_confirmations_entry_id_key: 'entry.already_decided',
  expense_decisions_expense_id_key: 'expense.already_decided',
  payment_decisions_payment_id_key: 'payment.already_decided',
  income_entries_one_reversal: 'correction.already_corrected',
  expenses_one_reversal: 'correction.already_corrected',
  memberships_one_active: 'invite.already_member',
};

/**
 * The Command API (Controller, design 8.2): validate, authorise, apply, record
 * events and the result, all in one transaction. The phone captures intent;
 * this decides.
 */
export async function handleCommand(
  database: Database,
  userId: string,
  input: unknown,
  now: string = new Date().toISOString(),
): Promise<CommandResult> {
  const clientId = typeof (input as { clientId?: unknown })?.clientId === 'string'
    ? (input as { clientId: string }).clientId
    : '';
  try {
    const command = parseCommand(input);
    return await database.asUser(userId, async (db) => {
      // UC9 5a: a retry returns the original result and changes nothing.
      const prior = await maybeOne<{ result: CommandResult }>(db, 'select result from command_log where client_id = $1', [
        command.clientId,
      ]);
      if (prior !== null) return prior.result;

      const ctx = await buildContext(db, userId, command.businessId, now, command.deviceTime);
      const data = await dispatch(ctx, command);
      for (const event of ctx.events) {
        await db.query('insert into outbox (business_id, event_type, payload) values ($1, $2, $3)', [
          event.businessId,
          event.type,
          JSON.stringify(event),
        ]);
      }
      const result: CommandResult = { ok: true, clientId: command.clientId, data };
      await db.query(
        `insert into command_log (client_id, user_id, business_id, type, result, device_time, received_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          command.clientId,
          userId,
          command.businessId ?? (typeof data.businessId === 'string' ? data.businessId : null),
          command.type,
          JSON.stringify(result),
          command.deviceTime,
          now,
        ],
      );
      return result;
    });
  } catch (error) {
    const domainError = asDomainError(error);
    if (domainError === null) throw error;
    return { ok: false, clientId, code: domainError.code, message: domainError.message };
  }
}

function dispatch(ctx: CommandContext, command: Command): Promise<Record<string, unknown>> {
  return (handlers[command.type] as Handler<CommandType>)(ctx, command.payload as never);
}

function asDomainError(error: unknown): DomainError | null {
  if (error instanceof DomainError) return error;
  const e = error as { code?: string; constraint?: string; constraint_name?: string };
  if (e?.code === '23505') {
    const constraint = e.constraint ?? e.constraint_name ?? '';
    return new DomainError(CONSTRAINT_CODES[constraint] ?? 'conflict.duplicate');
  }
  return null;
}
