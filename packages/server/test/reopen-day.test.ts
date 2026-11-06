import { asCommandApi, asUser, seedBusiness, freshDatabase } from '@dt/db-tests/harness';
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleCommand, type Database, type Db } from '../src/index.ts';

let pg: PGlite;
let database: Database;
let a: Awaited<ReturnType<typeof seedBusiness>>;

const NOW = '2026-11-05T12:00:00.000Z';
let clock = Date.parse(NOW);

/** Each command a minute after the last, as on a real day. */
const run = (userId: string, type: string, payload: Record<string, unknown>) => {
  clock += 60_000;
  const at = new Date(clock).toISOString();
  return handleCommand(database, userId, { type, clientId: randomUUID(), deviceTime: at, businessId: a.businessId, payload }, at);
};

async function ok(userId: string, type: string, payload: Record<string, unknown>) {
  const result = await run(userId, type, payload);
  if (!result.ok) throw new Error(`${type} failed: ${result.code}`);
  return result.data;
}

async function code(userId: string, type: string, payload: Record<string, unknown>) {
  const result = await run(userId, type, payload);
  return result.ok ? 'ok' : result.code;
}

const day = async () =>
  (await pg.query<{ odometer_end: number | null; ended_at: Date | null }>('select odometer_end, ended_at from trip_days where id = $1', [a.tripDayId])).rows[0]!;

const endDay = (reading: number) => ok(a.driverId, 'end_day', { tripDayId: a.tripDayId, odometerEnd: reading });
const reopen = (reason = 'Wrong odometer reading') => ({ tripDayId: a.tripDayId, reason });

beforeEach(async () => {
  pg = await freshDatabase();
  database = { asUser: (userId, fn) => asCommandApi(pg, userId, (tx) => fn(tx as unknown as Db)) };
  a = await seedBusiness(pg);
});

describe('reopen_day', () => {
  it('lets the owner reopen a day, and the driver end it again with the right reading', async () => {
    await endDay(4_555_000);
    await ok(a.ownerId, 'reopen_day', reopen());
    expect(await day()).toMatchObject({ odometer_end: null, ended_at: null });
    await endDay(1200);
    expect((await day()).odometer_end).toBe(1200);
  });

  it('keeps every earlier settlement, and what the day said', async () => {
    await endDay(4_555_000);
    const before = (await pg.query('select id from settlements where trip_day_id = $1', [a.tripDayId])).rows.length;
    await ok(a.ownerId, 'reopen_day', reopen());
    const after = (await pg.query('select id from settlements where trip_day_id = $1', [a.tripDayId])).rows.length;
    expect(after).toBeGreaterThanOrEqual(before);
    const { rows } = await pg.query<{ reason: string; previous_odometer_end: number; reopened_by: string }>(
      'select reason, previous_odometer_end, reopened_by from day_reopenings where trip_day_id = $1',
      [a.tripDayId],
    );
    expect(rows).toEqual([{ reason: 'Wrong odometer reading', previous_odometer_end: 4_555_000, reopened_by: a.ownerId }]);
  });

  it('can happen again if the second ending is also wrong', async () => {
    await endDay(4_555_000);
    await ok(a.ownerId, 'reopen_day', reopen());
    await endDay(9000);
    await ok(a.ownerId, 'reopen_day', reopen('Wrong again'));
    const { rows } = await pg.query('select id from day_reopenings where trip_day_id = $1', [a.tripDayId]);
    expect(rows).toHaveLength(2);
  });

  it('is only for the owner', async () => {
    await endDay(1200);
    expect(await code(a.driverId, 'reopen_day', reopen())).toBe('access.owner_only');
    expect((await day()).odometer_end).toBe(1200);
  });

  it('needs a reason, and a day that has ended', async () => {
    expect(await code(a.ownerId, 'reopen_day', reopen())).toBe('day.not_closed');
    await endDay(1200);
    expect(await code(a.ownerId, 'reopen_day', reopen('   '))).toBe('command.invalid');
  });

  it('refuses when a later day exists, because later balances were worked out from this one', async () => {
    await endDay(1200);
    await ok(a.driverId, 'start_day', { tripDayId: randomUUID(), vehicleId: a.vehicleId, serviceDate: '2026-11-03', odometerStart: 1200 });
    expect(await code(a.ownerId, 'reopen_day', reopen())).toBe('day.not_latest');
  });

  it('refuses when a payment has been recorded against the day', async () => {
    await endDay(1200);
    await pg.query(
      `insert into settlement_payments (id, business_id, trip_day_id, payer, amount_ngwee, method, claimed_by)
       values ($1, $2, $3, 'driver', 1000, 'cash', $4)`,
      [randomUUID(), a.businessId, a.tripDayId, a.driverId],
    );
    expect(await code(a.ownerId, 'reopen_day', reopen())).toBe('day.has_payments');
  });

  it('refuses another business’s owner', async () => {
    await endDay(1200);
    const other = await seedBusiness(pg);
    const result = await handleCommand(
      database,
      other.ownerId,
      { type: 'reopen_day', clientId: randomUUID(), deviceTime: NOW, businessId: other.businessId, payload: reopen() },
      NOW,
    );
    expect(result.ok).toBe(false);
    expect((await day()).odometer_end).toBe(1200);
  });
});

describe('a closed day in the database', () => {
  beforeEach(() => endDay(1200));

  it('cannot be reopened without a recorded reason, even by the Command API', async () => {
    await expect(
      asCommandApi(pg, a.ownerId, (tx) => tx.query('update trip_days set odometer_end = null, ended_at = null where id = $1', [a.tripDayId])),
    ).rejects.toThrow('is closed');
  });

  it('cannot be reopened from a phone, and the record cannot be changed afterwards', async () => {
    await expect(
      asUser(pg, a.ownerId, (tx) =>
        tx.query(
          `insert into day_reopenings (business_id, trip_day_id, driver_id, reason, previous_odometer_end, previous_ended_at, reopened_by)
           values ($1, $2, $3, 'x', 1, now(), $4)`,
          [a.businessId, a.tripDayId, a.driverId, a.ownerId],
        ),
      ),
    ).rejects.toThrow();
    await ok(a.ownerId, 'reopen_day', reopen());
    await expect(pg.query(`update day_reopenings set reason = 'changed'`)).rejects.toThrow();
  });
});

describe('limits on typed numbers', () => {
  it('refuses an odometer with more than seven digits', async () => {
    expect(await code(a.driverId, 'end_day', { tripDayId: a.tripDayId, odometerEnd: 10_000_000 })).toBe('day.invalid_odometer');
  });

  it('refuses an amount over K1,000,000', async () => {
    const result = await code(a.driverId, 'record_handover', {
      entryId: randomUUID(),
      tripDayId: a.tripDayId,
      kind: 'takings',
      amount: 100_000_001,
      method: 'cash',
      giver: { kind: 'conductor', userId: null },
      receiver: { kind: 'driver', userId: null },
    });
    expect(result).toBe('amount.too_large');
  });
});
