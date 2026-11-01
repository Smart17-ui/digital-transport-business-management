import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/index.ts';

const envelope = (type: string, payload: unknown, businessId: string | null = randomUUID()) => ({
  type,
  clientId: randomUUID(),
  deviceTime: '2026-11-02T08:00:00Z',
  businessId,
  payload,
});

describe('parseCommand', () => {
  it('accepts a valid handover command', () => {
    const cmd = parseCommand(
      envelope('record_handover', {
        entryId: randomUUID(),
        tripDayId: randomUUID(),
        kind: 'takings',
        amount: 15_000,
        method: 'cash',
        giver: { kind: 'conductor', userId: null },
        receiver: { kind: 'driver', userId: randomUUID() },
      }),
    );
    expect(cmd.type).toBe('record_handover');
  });

  it('rejects unknown types, bad ids and fractional amounts', () => {
    expect(() => parseCommand(envelope('delete_everything', {}))).toThrow('command.invalid');
    expect(() => parseCommand(envelope('end_day', { tripDayId: 'x', odometerEnd: 1 }))).toThrow('payload.tripDayId');
    expect(() =>
      parseCommand(envelope('claim_payment', { paymentId: randomUUID(), tripDayId: randomUUID(), amount: 10.5, method: 'cash' })),
    ).toThrow('payload.amount');
  });

  it('requires a business except for sign-up commands', () => {
    expect(() => parseCommand(envelope('end_day', { tripDayId: randomUUID(), odometerEnd: 1 }, null))).toThrow(
      'businessId is required',
    );
    expect(parseCommand(envelope('join_business', { code: 'ABC123' }, null)).type).toBe('join_business');
  });
});
