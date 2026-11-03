import { ARRANGEMENT_TYPES } from './arrangement/arrangement.ts';
import { DomainError } from './errors.ts';
import { v, type Reader } from './validate.ts';

/**
 * Command pattern: every write the app makes is a stored request with a
 * client-generated id. The app builds and queues it; the Command API validates
 * and applies it. Replaying the same clientId is harmless (UC9 5a).
 *
 * Ids of new things (tripDayId, entryId, ...) are generated on the phone, so a
 * day started offline can have handovers recorded against it before sync.
 */
const party = v.object({
  kind: v.oneOf(['conductor', 'driver', 'owner']),
  userId: v.nullable(v.uuid()),
});
const bearer = v.oneOf(['owner', 'driver']);
const amount = v.int();

const payloads = {
  create_business: v.object({ businessId: v.uuid(), name: v.nonEmpty(100) }),
  create_invite: v.object({ role: v.oneOf(['driver']) }),
  join_business: v.object({ code: v.nonEmpty(12) }),
  register_vehicle: v.object({ vehicleId: v.uuid(), plate: v.nonEmpty(20), vehicleType: v.nonEmpty(40) }),
  add_conductor: v.object({ conductorId: v.uuid(), vehicleId: v.uuid(), name: v.nonEmpty(80) }),
  propose_arrangement: v.object({
    arrangementId: v.uuid(),
    vehicleId: v.uuid(),
    driverId: v.uuid(),
    type: v.oneOf(ARRANGEMENT_TYPES),
    terms: v.any(),
    fuelBearer: bearer,
    otherCostsBearer: bearer,
    fuelFloat: v.nullable(amount),
    effectiveFrom: v.date(),
  }),
  respond_arrangement: v.object({
    arrangementId: v.uuid(),
    accept: v.boolean(),
    reason: v.nullable(v.string(300)),
  }),
  start_day: v.object({
    tripDayId: v.uuid(),
    vehicleId: v.uuid(),
    serviceDate: v.date(),
    odometerStart: v.int(),
  }),
  end_day: v.object({ tripDayId: v.uuid(), odometerEnd: v.int() }),
  record_handover: v.object({
    entryId: v.uuid(),
    tripDayId: v.uuid(),
    kind: v.oneOf(['takings', 'remittance']),
    amount,
    method: v.nonEmpty(30),
    giver: party,
    receiver: party,
  }),
  decide_handover: v.object({
    entryId: v.uuid(),
    decision: v.oneOf(['confirm', 'dispute']),
    reason: v.nullable(v.string(300)),
  }),
  log_expense: v.object({
    expenseId: v.uuid(),
    tripDayId: v.nullable(v.uuid()),
    vehicleId: v.uuid(),
    category: v.nonEmpty(40),
    amount,
    litres: v.nullable(v.number()),
    paidBy: v.oneOf(['driver_cash', 'advance', 'owner']),
    note: v.string(500),
    receiptPath: v.nullable(v.string(300)),
    borneByOverride: v.nullable(bearer),
  }),
  correct_entry: v.object({
    entryType: v.oneOf(['income', 'expense']),
    originalId: v.uuid(),
    reversalId: v.uuid(),
    replacementId: v.uuid(),
    amount,
    borneBy: v.nullable(bearer),
    reason: v.nonEmpty(300),
  }),
  claim_payment: v.object({
    paymentId: v.uuid(),
    tripDayId: v.uuid(),
    amount,
    method: v.nonEmpty(30),
  }),
  decide_payment: v.object({
    paymentId: v.uuid(),
    accept: v.boolean(),
    confirmedAmount: v.nullable(amount),
    reason: v.nullable(v.string(300)),
  }),
  reverse_payment: v.object({ paymentId: v.uuid(), reason: v.nonEmpty(300) }),
  remove_member: v.object({ userId: v.uuid() }),
  record_consent: v.object({ scope: v.nonEmpty(40), noticeVersion: v.nonEmpty(20) }),
  set_profile: v.object({ displayName: v.nonEmpty(80), language: v.oneOf(['en', 'bem', 'nya']) }),
  register_device: v.object({ token: v.nonEmpty(300), platform: v.oneOf(['ios', 'android']) }),
} satisfies Record<string, Reader<unknown>>;

export type CommandType = keyof typeof payloads;
export const COMMAND_TYPES = Object.keys(payloads) as CommandType[];

export type CommandPayload<T extends CommandType> = ReturnType<(typeof payloads)[T]>;

export type Command = {
  [T in CommandType]: {
    type: T;
    /** Idempotency key, generated on the phone. */
    clientId: string;
    /** When the user acted, by the phone's clock. */
    deviceTime: string;
    /** Null only for commands made before the user belongs to a business. */
    businessId: string | null;
    payload: CommandPayload<T>;
  };
}[CommandType];

/** Commands that need no business yet. */
export const BUSINESSLESS_COMMANDS: readonly CommandType[] = [
  'create_business',
  'join_business',
  'record_consent',
  'set_profile',
  'register_device',
];

/** Validates an untrusted command, as the server must for everything the app sends. */
export function parseCommand(input: unknown): Command {
  const envelope = v.object({
    type: v.oneOf(COMMAND_TYPES),
    clientId: v.uuid(),
    deviceTime: v.timestamp(),
    businessId: v.nullable(v.uuid()),
    payload: v.any(),
  })(input, 'command');
  if (envelope.businessId === null && !BUSINESSLESS_COMMANDS.includes(envelope.type)) {
    throw new DomainError('command.invalid', 'command.businessId is required');
  }
  const payload = payloads[envelope.type](envelope.payload, 'payload');
  return { ...envelope, payload } as Command;
}

export type CommandResult =
  | { ok: true; clientId: string; data: Record<string, unknown> }
  | { ok: false; clientId: string; code: string; message: string };
