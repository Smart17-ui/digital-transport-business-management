import { asCommandApi, asUser, createUser, freshDatabase, seedBusiness } from '@dt/db-tests/harness';
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { recordPositions, type Database, type Db } from '../src/index.ts';

let pg: PGlite;
let database: Database;
let a: Awaited<ReturnType<typeof seedBusiness>>;
let deviceId: string;
let startedAt: number;

const NOW = '2026-11-05T12:00:00.000Z';

const point = (minutesAfterStart: number, over: Record<string, unknown> = {}) => ({
  latitude: -15.4167,
  longitude: 28.2833,
  speedKmh: 30,
  heading: 90,
  accuracyM: 10,
  recordedAt: new Date(startedAt + minutesAfterStart * 60_000).toISOString(),
  ...over,
});

const upload = (points: unknown[], over: Record<string, unknown> = {}) => ({ tripDayId: a.tripDayId, deviceId, points, ...over });

const lastPosition = async () => {
  const { rows } = await pg.query<{ recorded_at: Date; latitude: number }>('select recorded_at, latitude from vehicle_last_positions where vehicle_id = $1', [
    a.vehicleId,
  ]);
  return rows[0];
};

beforeEach(async () => {
  pg = await freshDatabase();
  database = { asUser: (userId, fn) => asCommandApi(pg, userId, (tx) => fn(tx as unknown as Db)) };
  a = await seedBusiness(pg);
  deviceId = randomUUID();
  const { rows } = await pg.query<{ started_at: Date }>('select started_at from trip_days where id = $1', [a.tripDayId]);
  startedAt = rows[0]!.started_at.getTime();
});

describe('recordPositions', () => {
  it('stores points and moves the bus on the map', async () => {
    const result = await recordPositions(database, a.driverId, upload([point(1), point(2, { latitude: -15.41 })]), NOW);
    expect(result).toEqual({ accepted: 2, dropped: 0 });
    expect((await lastPosition())?.latitude).toBe(-15.41);
  });

  it('adds nothing when a batch is sent twice', async () => {
    await recordPositions(database, a.driverId, upload([point(1)]), NOW);
    const again = await recordPositions(database, a.driverId, upload([point(1)]), NOW);
    expect(again.accepted).toBe(0);
    const { rows } = await pg.query('select id from positions');
    expect(rows).toHaveLength(1);
  });

  it('does not move the bus back when older points arrive late', async () => {
    await recordPositions(database, a.driverId, upload([point(10, { latitude: -15.41 })]), NOW);
    await recordPositions(database, a.driverId, upload([point(5, { latitude: -15.5 })]), NOW);
    expect((await lastPosition())?.latitude).toBe(-15.41);
  });

  it('never stores a point from before the day started', async () => {
    const result = await recordPositions(database, a.driverId, upload([point(-60), point(1)]), NOW);
    expect(result).toEqual({ accepted: 1, dropped: 1 });
  });

  it('never stores a point from after the day ended, but accepts earlier ones sent late', async () => {
    const endedAt = new Date(startedAt + 60 * 60_000).toISOString();
    await pg.query('update trip_days set odometer_end = 1100, ended_at = $1 where id = $2', [endedAt, a.tripDayId]);
    const result = await recordPositions(database, a.driverId, upload([point(30), point(120)]), NOW);
    expect(result).toEqual({ accepted: 1, dropped: 1 });
  });

  it('drops points the phone was unsure of', async () => {
    const result = await recordPositions(database, a.driverId, upload([point(1, { accuracyM: 500 })]), NOW);
    expect(result).toEqual({ accepted: 0, dropped: 1 });
  });

  it('refuses a day that is not this driver’s, or has not reached the server yet', async () => {
    await expect(recordPositions(database, a.ownerId, upload([point(1)]), NOW)).rejects.toThrow('day.not_found');
    await expect(recordPositions(database, a.driverId, upload([point(1)], { tripDayId: randomUUID() }), NOW)).rejects.toThrow('day.not_found');
  });

  it('refuses a driver who has left the business', async () => {
    await pg.query('update memberships set ended_at = now() where user_id = $1', [a.driverId]);
    // Row level security hides the business's days from them.
    await expect(recordPositions(database, a.driverId, upload([point(1)]), NOW)).rejects.toThrow('day.not_found');
  });

  it('refuses another driver’s device', async () => {
    const b = await createUser(pg, '+260960000009');
    await pg.query(`insert into memberships (business_id, user_id, role) values ($1, $2, 'driver')`, [a.businessId, b]);
    await pg.query(`insert into devices (id, business_id, driver_id, type) values ($1, $2, $3, 'phone')`, [deviceId, a.businessId, b]);
    await expect(recordPositions(database, a.driverId, upload([point(1)]), NOW)).rejects.toThrow('tracking.device_not_yours');
  });
});

describe('who can read a position', () => {
  const read = (userId: string) =>
    asUser(pg, userId, async (tx) => (await tx.query('select vehicle_id from vehicle_last_positions')).rows.length);

  beforeEach(async () => {
    await recordPositions(database, a.driverId, upload([point(1)]), NOW);
  });

  it('lets the owner and that driver see it', async () => {
    expect(await read(a.ownerId)).toBe(1);
    expect(await read(a.driverId)).toBe(1);
  });

  it('hides it from another business and from another driver in the same one', async () => {
    const other = await seedBusiness(pg);
    expect(await read(other.ownerId)).toBe(0);
    const colleague = await createUser(pg, '+260960000010');
    await pg.query(`insert into memberships (business_id, user_id, role) values ($1, $2, 'driver')`, [a.businessId, colleague]);
    expect(await read(colleague)).toBe(0);
  });

  it('does not let a phone write positions directly', async () => {
    await expect(
      asUser(pg, a.driverId, (tx) =>
        tx.query(
          `insert into vehicle_last_positions (vehicle_id, business_id, trip_day_id, driver_id, latitude, longitude, recorded_at, received_at)
           values ($1, $2, $3, $4, 0, 0, now(), now())`,
          [randomUUID(), a.businessId, a.tripDayId, a.driverId],
        ),
      ),
    ).rejects.toThrow();
  });
});
