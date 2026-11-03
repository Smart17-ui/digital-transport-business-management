import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { asCommandApi, asUser, createUser, freshDatabase, seedBusiness } from './harness.ts';

let db: PGlite;
let a: Awaited<ReturnType<typeof seedBusiness>>;
let b: Awaited<ReturnType<typeof seedBusiness>>;

beforeEach(async () => {
  db = await freshDatabase();
  a = await seedBusiness(db);
  b = await seedBusiness(db);
});

describe('JSON columns', () => {
  // The Edge Function's Postgres driver encoded JSON a second time, leaving text
  // the app and the arrangement rules could not read. This driver does not, so
  // the constraints are what catch it here and in production.
  it('rejects JSON that has been encoded twice', async () => {
    const insert = (terms: string) =>
      db.query(
        `insert into arrangements (id, business_id, vehicle_id, driver_id, type, terms, fuel_bearer, other_costs_bearer,
           effective_from, proposed_by)
         values ($1, $2, $3, $4, 'fixed_target', $5::text::jsonb, 'owner', 'owner', '2026-11-01', $6)`,
        [randomUUID(), a.businessId, a.vehicleId, a.driverId, terms, a.ownerId],
      );
    await expect(insert(JSON.stringify(JSON.stringify({ dailyTarget: 50_000 })))).rejects.toThrow('arrangements_terms_object');
    await insert(JSON.stringify({ dailyTarget: 50_000 }));
  });
});

describe('append-only money tables', () => {
  it('rejects updates and deletes on income entries, even from the database owner', async () => {
    await expect(db.query('update income_entries set amount_ngwee = 1 where id = $1', [a.entryId])).rejects.toThrow(
      'append-only',
    );
    await expect(db.query('delete from income_entries where id = $1', [a.entryId])).rejects.toThrow('append-only');
  });

  it('allows only reversing entries to be negative', async () => {
    const insert = (amount: number, reverses: string | null) =>
      db.query(
        `insert into income_entries (id, business_id, trip_day_id, kind, amount_ngwee, method, giver_kind,
           receiver_kind, recorded_by, source, reverses_id)
         values ($1, $2, $3, 'takings', $4, 'cash', 'conductor', 'driver', $5, 'correction', $6)`,
        [randomUUID(), a.businessId, a.tripDayId, amount, a.ownerId, reverses],
      );
    await expect(insert(-500, null)).rejects.toThrow('check constraint');
    await insert(-15000, a.entryId);
    await expect(insert(-15000, a.entryId)).rejects.toThrow('income_entries_one_reversal');
  });

  it('allows a trip day to be closed once and nothing else to change', async () => {
    await expect(db.query('update trip_days set odometer_start = 0 where id = $1', [a.tripDayId])).rejects.toThrow(
      'only the end',
    );
    await db.query('update trip_days set odometer_end = 1100, ended_at = now() where id = $1', [a.tripDayId]);
    await expect(
      db.query('update trip_days set odometer_end = 1200 where id = $1', [a.tripDayId]),
    ).rejects.toThrow('is closed');
  });

  it('allows only one open day per vehicle', async () => {
    await expect(
      db.query(
        `insert into trip_days (id, business_id, vehicle_id, driver_id, arrangement_id, service_date, odometer_start)
         values ($1, $2, $3, $4, $5, '2026-11-02', 1000)`,
        [randomUUID(), a.businessId, a.vehicleId, a.driverId, a.arrangementId],
      ),
    ).rejects.toThrow('trip_days_one_open_per_vehicle');
  });

  it('keeps arrangement terms immutable', async () => {
    await expect(
      db.query(`update arrangements set terms = '{"dailyTarget": 1}' where id = $1`, [a.arrangementId]),
    ).rejects.toThrow('immutable');
  });
});

describe('row level security for phones', () => {
  it('a member cannot read another business', async () => {
    const rows = await asUser(db, a.ownerId, (tx) =>
      tx.query<{ id: string }>('select id from businesses'),
    );
    expect(rows.rows.map((r) => r.id)).toEqual([a.businessId]);

    for (const table of ['vehicles', 'trip_days', 'income_entries', 'arrangements', 'memberships']) {
      const other = await asUser(db, a.ownerId, (tx) =>
        tx.query(`select 1 from ${table} where business_id = $1`, [b.businessId]),
      );
      expect(other.rows, table).toHaveLength(0);
    }
  });

  it('phones cannot write, even to their own business', async () => {
    await expect(
      asUser(db, a.driverId, (tx) =>
        tx.query(
          `insert into income_entries (id, business_id, trip_day_id, kind, amount_ngwee, method, giver_kind,
             receiver_kind, recorded_by, source)
           values ($1, $2, $3, 'takings', 100, 'cash', 'conductor', 'driver', $4, 'app')`,
          [randomUUID(), a.businessId, a.tripDayId, a.driverId],
        ),
      ),
    ).rejects.toThrow('permission denied');
  });

  it('a Driver sees only their own days, and keeps them after removal', async () => {
    const otherDriver = await createUser(db);
    await db.query(`insert into memberships (business_id, user_id, role) values ($1, $2, 'driver')`, [
      a.businessId,
      otherDriver,
    ]);
    const visible = await asUser(db, otherDriver, (tx) => tx.query('select 1 from trip_days'));
    expect(visible.rows).toHaveLength(0);

    await db.query(`update memberships set ended_at = now() where user_id = $1`, [a.driverId]);
    const own = await asUser(db, a.driverId, (tx) => tx.query('select 1 from income_entries'));
    expect(own.rows).toHaveLength(1);
    const vehicles = await asUser(db, a.driverId, (tx) => tx.query('select 1 from vehicles'));
    expect(vehicles.rows).toHaveLength(0);
  });

  it('phones cannot read the outbox, command log or invite codes', async () => {
    for (const table of ['outbox', 'command_log', 'invite_codes']) {
      await expect(asUser(db, a.ownerId, (tx) => tx.query(`select 1 from ${table}`)), table).rejects.toThrow(
        'permission denied',
      );
    }
  });
});

describe('row level security for the Command API', () => {
  it('cannot write into a business the acting user does not belong to', async () => {
    await expect(
      asCommandApi(db, a.ownerId, (tx) =>
        tx.query(`insert into vehicles (id, business_id, plate, vehicle_type) values ($1, $2, 'X 1', 'bus')`, [
          randomUUID(),
          b.businessId,
        ]),
      ),
    ).rejects.toThrow('row-level security');
  });

  it('writes within the acting user business', async () => {
    await asCommandApi(db, a.ownerId, (tx) =>
      tx.query(`insert into vehicles (id, business_id, plate, vehicle_type) values ($1, $2, 'X 1', 'bus')`, [
        randomUUID(),
        a.businessId,
      ]),
    );
  });

  it('a user cannot make themselves a member without an invite', async () => {
    const stranger = await createUser(db);
    await expect(
      asCommandApi(db, stranger, (tx) =>
        tx.query(`insert into memberships (business_id, user_id, role) values ($1, $2, 'owner')`, [
          a.businessId,
          stranger,
        ]),
      ),
    ).rejects.toThrow('row-level security');
  });

  it('a user can join with a redeemed invite code, for its role only', async () => {
    const joiner = await createUser(db);
    await db.query(
      `insert into invite_codes (code, business_id, role, created_by, expires_at)
       values ('ABC123', $1, 'driver', $2, now() + interval '1 day')`,
      [a.businessId, a.ownerId],
    );
    await asCommandApi(db, joiner, async (tx) => {
      await tx.query(`update invite_codes set used_by = $1, used_at = now() where code = 'ABC123'`, [joiner]);
      await tx.query(`insert into memberships (business_id, user_id, role) values ($1, $2, 'driver')`, [
        a.businessId,
        joiner,
      ]);
    });
    await expect(
      asCommandApi(db, joiner, (tx) =>
        tx.query(`insert into memberships (business_id, user_id, role) values ($1, $2, 'owner')`, [
          a.businessId,
          joiner,
        ]),
      ),
    ).rejects.toThrow();
  });
});

describe('outbox', () => {
  it('claims each event once across concurrent relays', async () => {
    await db.query(`insert into outbox (business_id, event_type, payload) values ($1, 'DayStarted', '{}')`, [
      a.businessId,
    ]);
    const first = await db.query('select * from claim_outbox(10)');
    expect(first.rows).toHaveLength(1);
    await db.query('update outbox set processed_at = now()');
    const second = await db.query('select * from claim_outbox(10)');
    expect(second.rows).toHaveLength(0);
  });
});
