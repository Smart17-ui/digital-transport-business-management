import { asCommandApi, createUser, freshDatabase } from '@dt/db-tests/harness';
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  catalogues,
  handleCommand,
  notificationService,
  relayOutbox,
  viewSettlement,
  type Database,
  type Db,
  type PushGateway,
} from '../src/index.ts';

let pg: PGlite;
let database: Database;
let owner: string;
let driver: string;
let businessId: string;
let vehicleId: string;
let clock: number;

function now(): string {
  clock += 60_000;
  return new Date(clock).toISOString();
}

async function run(userId: string, type: string, payload: Record<string, unknown>, opts: { business?: string | null; clientId?: string } = {}) {
  return handleCommand(
    database,
    userId,
    {
      type,
      clientId: opts.clientId ?? randomUUID(),
      deviceTime: new Date(clock).toISOString(),
      businessId: opts.business === undefined ? businessId : opts.business,
      payload,
    },
    now(),
  );
}

async function ok(userId: string, type: string, payload: Record<string, unknown>, business?: string | null) {
  const result = await run(userId, type, payload, { business });
  if (!result.ok) throw new Error(`${type} failed: ${result.code} ${result.message}`);
  return result.data;
}

const takings = (tripDayId: string, amount: number) => ({
  entryId: randomUUID(),
  tripDayId,
  kind: 'takings',
  amount,
  method: 'cash',
  giver: { kind: 'conductor', userId: null },
  receiver: { kind: 'driver', userId: null },
});

async function workDay(date: string, gross: number, fuel = 0) {
  const tripDayId = randomUUID();
  await ok(driver, 'start_day', { tripDayId, vehicleId, serviceDate: date, odometerStart: 10_000 });
  const entry = takings(tripDayId, gross);
  await ok(driver, 'record_handover', entry);
  await ok(owner, 'decide_handover', { entryId: entry.entryId, decision: 'confirm', reason: null });
  if (fuel > 0) {
    await ok(driver, 'log_expense', {
      expenseId: randomUUID(), tripDayId, vehicleId, category: 'fuel', amount: fuel, litres: 10,
      paidBy: 'driver_cash', note: '', receiptPath: null, borneByOverride: null,
    });
  }
  await ok(driver, 'end_day', { tripDayId, odometerEnd: 10_150 });
  return { tripDayId, entryId: entry.entryId };
}

beforeEach(async () => {
  pg = await freshDatabase();
  database = { asUser: (userId, fn) => asCommandApi(pg, userId, (tx) => fn(tx as unknown as Db)) };
  clock = Date.parse('2026-11-02T04:00:00Z');
  owner = await createUser(pg);
  driver = await createUser(pg, '+260960000001');
  businessId = randomUUID();
  vehicleId = randomUUID();

  await ok(owner, 'create_business', { businessId, name: 'Lusaka Express' }, null);
  await ok(owner, 'register_vehicle', { vehicleId, plate: 'bab 1234', vehicleType: 'minibus' });
  const { code } = await ok(owner, 'create_invite', { role: 'driver' });
  await ok(driver, 'join_business', { code }, null);
  const arrangementId = randomUUID();
  await ok(owner, 'propose_arrangement', {
    arrangementId, vehicleId, driverId: driver, type: 'fixed_target', terms: { dailyTarget: 50_000 },
    fuelBearer: 'owner', otherCostsBearer: 'owner', fuelFloat: null, effectiveFrom: '2026-11-01',
  });
  await ok(driver, 'respond_arrangement', { arrangementId, accept: true, reason: null });
});

describe('Version 0 money flow through the Command API', () => {
  it('settles a day: target K500, takings K800, owner-borne fuel K200 paid from cash', async () => {
    const { tripDayId } = await workDay('2026-11-02', 80_000, 20_000);
    const view = await viewSettlement(database, owner, tripDayId);
    expect(view.statement.provisional).toBe(false);
    expect(view.statement.ownerShare).toBe(30_000);
    expect(view.statement.whoOwesWhom).toBe('driver_owes_owner');
    expect(view.statement.amountOwed).toBe(30_000);
    expect(view.position.state).toBe('unpaid');
  });

  it('a part payment carries the rest forward as arrears into the next day', async () => {
    const first = await workDay('2026-11-02', 80_000, 20_000);
    const paymentId = randomUUID();
    await ok(driver, 'claim_payment', { paymentId, tripDayId: first.tripDayId, amount: 30_000, method: 'cash' });
    const decided = await ok(owner, 'decide_payment', { paymentId, accept: true, confirmedAmount: 25_000, reason: null });
    expect(decided).toMatchObject({ state: 'part_paid', remaining: 5_000 });

    const second = await workDay('2026-11-03', 50_000);
    const view = await viewSettlement(database, driver, second.tripDayId);
    expect(view.statement.arrearsBroughtForward).toBe(5_000);
    expect(view.statement.netBalance).toBe(55_000);
  });

  it('a correction reverses and replaces the entry and recalculates', async () => {
    const { tripDayId, entryId } = await workDay('2026-11-02', 80_000);
    await ok(owner, 'correct_entry', {
      entryType: 'income', originalId: entryId, reversalId: randomUUID(), replacementId: randomUUID(),
      amount: 75_000, borneBy: null, reason: 'Counted twice',
    });
    const view = await viewSettlement(database, owner, tripDayId);
    expect(view.statement.grossIncome).toBe(75_000);
    const original = await pg.query<{ amount_ngwee: number }>('select amount_ngwee from income_entries where id = $1', [entryId]);
    expect(Number(original.rows[0]!.amount_ngwee)).toBe(80_000);
    const audit = await pg.query('select 1 from audit_entries where entity_id = $1', [entryId]);
    expect(audit.rows).toHaveLength(1);
  });

  it('a retried command is applied once and returns the same result (UC9 5a)', async () => {
    const tripDayId = randomUUID();
    await ok(driver, 'start_day', { tripDayId, vehicleId, serviceDate: '2026-11-02', odometerStart: 10_000 });
    const clientId = randomUUID();
    const payload = takings(tripDayId, 15_000);
    const first = await run(driver, 'record_handover', payload, { clientId });
    const retry = await run(driver, 'record_handover', payload, { clientId });
    expect(retry).toEqual(first);
    const rows = await pg.query('select 1 from income_entries where trip_day_id = $1', [tripDayId]);
    expect(rows.rows).toHaveLength(1);
  });

  it('refuses what the rules forbid, whatever the app sends', async () => {
    const tripDayId = randomUUID();
    await ok(driver, 'start_day', { tripDayId, vehicleId, serviceDate: '2026-11-02', odometerStart: 10_000 });

    const negative = await run(driver, 'record_handover', takings(tripDayId, -500));
    expect(negative).toMatchObject({ ok: false, code: 'handover.amount_not_positive' });

    const second = await run(driver, 'start_day', { tripDayId: randomUUID(), vehicleId, serviceDate: '2026-11-02', odometerStart: 1 });
    expect(second).toMatchObject({ ok: false, code: 'day.already_open' });

    const entry = takings(tripDayId, 10_000);
    await ok(driver, 'record_handover', entry);
    const selfConfirm = await run(driver, 'decide_handover', { entryId: entry.entryId, decision: 'confirm', reason: null });
    expect(selfConfirm).toMatchObject({ ok: false, code: 'entry.not_allowed_to_confirm' });

    const driverCorrects = await run(driver, 'correct_entry', {
      entryType: 'income', originalId: entry.entryId, reversalId: randomUUID(), replacementId: randomUUID(),
      amount: 1, borneBy: null, reason: 'x',
    });
    expect(driverCorrects).toMatchObject({ ok: false, code: 'access.owner_only' });
  });

  it('a removed member is cut off, including commands queued while offline (UC45, UC9 5d)', async () => {
    await ok(owner, 'remove_member', { userId: driver });
    const queued = await run(driver, 'start_day', { tripDayId: randomUUID(), vehicleId, serviceDate: '2026-11-02', odometerStart: 1 });
    expect(queued).toMatchObject({ ok: false, code: 'access.not_member' });
  });

  it('cannot act on another business by naming it', async () => {
    const stranger = await createUser(pg, '+260970000009');
    const result = await run(stranger, 'register_vehicle', { vehicleId: randomUUID(), plate: 'X 1', vehicleType: 'bus' });
    expect(result).toMatchObject({ ok: false, code: 'access.not_member' });
  });
});

describe('notifications through the outbox relay', () => {
  it('delivers to the other party only, by push, with no amounts in the text', async () => {
    const sent: { token: string; title: string; body: string }[] = [];
    const gateway: PushGateway = {
      async send(token, message) {
        sent.push({ token, title: message.title, body: message.body });
        return true;
      },
    };
    await pg.query(`insert into device_tokens (token, user_id, platform) values ('owner-phone', $1, 'android')`, [owner]);

    await workDay('2026-11-02', 80_000);
    const relayed = await relayOutbox(pg as unknown as Db, [notificationService(gateway, catalogues)]);
    expect(relayed).toBeGreaterThan(0);

    const inbox = await pg.query<{ user_id: string; event_type: string; delivered_via: string }>(
      'select user_id, event_type, delivered_via from notifications order by created_at',
    );
    // The driver joined, accepted, started, recorded and closed: the owner hears about each.
    expect(inbox.rows.filter((n) => n.user_id === owner).map((n) => n.event_type)).toEqual(
      expect.arrayContaining(['MemberJoined', 'ArrangementAccepted', 'DayStarted', 'HandoverRecorded', 'DayClosed']),
    );
    // The owner confirmed the handover: only the driver hears about that, via the inbox (no token).
    const confirmed = inbox.rows.filter((n) => n.event_type === 'HandoverConfirmed');
    expect(confirmed).toEqual([{ user_id: driver, event_type: 'HandoverConfirmed', delivered_via: 'inbox' }]);
    expect(sent.every((m) => !/\d/.test(m.title + m.body))).toBe(true);

    // Running the relay again delivers nothing twice.
    expect(await relayOutbox(pg as unknown as Db, [notificationService(gateway, catalogues)])).toBe(0);
  });
});
