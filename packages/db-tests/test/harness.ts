import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(import.meta.dirname, '../../../supabase/migrations');

// Stand-ins for what Supabase provides: the auth schema, auth.uid() and the
// API roles. Everything else comes from the real migration files.
const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, phone text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to authenticated;
  grant usage on schema public to anon, authenticated;
`;

export async function freshDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
  return db;
}

export async function createUser(db: PGlite, phone = '+260970000000'): Promise<string> {
  const id = randomUUID();
  await db.query('insert into auth.users (id, phone) values ($1, $2)', [id, phone]);
  return id;
}

/** Runs fn as a phone user would: role authenticated, with their JWT subject. */
export async function asUser<T>(db: PGlite, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId })]);
    await tx.exec('set local role authenticated');
    return fn(tx);
  });
}

/** Runs fn as the Command API does: role command_api, acting for userId. */
export async function asCommandApi<T>(db: PGlite, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('app.user_id', $1, true)`, [userId]);
    await tx.exec('set local role command_api');
    return fn(tx);
  });
}

export type Tx = Parameters<Parameters<PGlite['transaction']>[0]>[0];

/** A business with an Owner, a Driver, a vehicle, an active arrangement and an open day. */
export async function seedBusiness(db: PGlite) {
  const ownerId = await createUser(db);
  const driverId = await createUser(db, '+260960000000');
  const businessId = randomUUID();
  const vehicleId = randomUUID();
  const arrangementId = randomUUID();
  const tripDayId = randomUUID();
  const entryId = randomUUID();
  await db.exec(`
    insert into businesses (id, name, owner_id) values ('${businessId}', 'Test Bus Co', '${ownerId}');
    insert into memberships (business_id, user_id, role) values
      ('${businessId}', '${ownerId}', 'owner'), ('${businessId}', '${driverId}', 'driver');
    insert into vehicles (id, business_id, plate, vehicle_type) values ('${vehicleId}', '${businessId}', 'BAB 1234', 'minibus');
    insert into arrangements (id, business_id, vehicle_id, driver_id, type, terms, fuel_bearer, other_costs_bearer,
                              effective_from, proposed_by, status)
      values ('${arrangementId}', '${businessId}', '${vehicleId}', '${driverId}', 'fixed_target',
              '{"dailyTarget": 50000}', 'owner', 'owner', '2026-11-01', '${ownerId}', 'active');
    insert into trip_days (id, business_id, vehicle_id, driver_id, arrangement_id, service_date, odometer_start)
      values ('${tripDayId}', '${businessId}', '${vehicleId}', '${driverId}', '${arrangementId}', '2026-11-02', 1000);
    insert into income_entries (id, business_id, trip_day_id, kind, amount_ngwee, method, giver_kind,
                                receiver_kind, receiver_user_id, recorded_by, source)
      values ('${entryId}', '${businessId}', '${tripDayId}', 'takings', 15000, 'cash', 'conductor',
              'driver', '${driverId}', '${driverId}', 'app');
  `);
  return { ownerId, driverId, businessId, vehicleId, arrangementId, tripDayId, entryId };
}
