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

async function logFuel(tripDayId: string, amount: number) {
  const expenseId = randomUUID();
  await ok(driver, 'log_expense', {
    expenseId, tripDayId, vehicleId, category: 'fuel', amount, litres: 10,
    paidBy: 'driver_cash', note: '', receiptPath: null, borneByOverride: null,
  });
  return expenseId;
}

async function workDay(date: string, gross: number, fuel = 0) {
  const tripDayId = randomUUID();
  await ok(driver, 'start_day', { tripDayId, vehicleId, serviceDate: date, odometerStart: 10_000 });
  const entry = takings(tripDayId, gross);
  await ok(driver, 'record_handover', entry);
  await ok(owner, 'decide_handover', { entryId: entry.entryId, decision: 'confirm', reason: null });
  if (fuel > 0) {
    const expenseId = await logFuel(tripDayId, fuel);
    await ok(owner, 'decide_expense', { expenseId, accept: true, reason: null });
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

  describe('reporting a bad day', () => {
    const report = (over: Record<string, unknown> = {}) => ({
      reportId: randomUUID(), vehicleId, serviceDate: '2026-11-02', kind: 'breakdown', reason: 'Gearbox failed at noon', ...over,
    });

    /** Target K500: a day that took K300, of which K200 reached the owner. */
    async function shortDay() {
      const tripDayId = randomUUID();
      await ok(driver, 'start_day', { tripDayId, vehicleId, serviceDate: '2026-11-02', odometerStart: 1 });
      const takingsEntry = takings(tripDayId, 30_000);
      const handed = {
        ...takings(tripDayId, 20_000), kind: 'remittance', giver: { kind: 'driver', userId: null }, receiver: { kind: 'owner', userId: null },
      };
      await ok(driver, 'record_handover', takingsEntry);
      await ok(driver, 'record_handover', handed);
      await ok(owner, 'decide_handover', { entryId: takingsEntry.entryId, decision: 'confirm', reason: null });
      await ok(owner, 'decide_handover', { entryId: handed.entryId, decision: 'confirm', reason: null });
      await ok(driver, 'end_day', { tripDayId, odometerEnd: 2 });
      return tripDayId;
    }

    it('changes nothing until accepted, then nothing more is owed and what was handed over stands', async () => {
      const tripDayId = await shortDay();
      const before = await viewSettlement(database, owner, tripDayId);
      expect(before.statement.owedForDay).toBe(30_000);

      const payload = report();
      await ok(driver, 'report_day', payload);
      const waiting = await viewSettlement(database, owner, tripDayId);
      expect(waiting.statement.owedForDay).toBe(30_000);
      expect(waiting.statement.provisional).toBe(true);

      await ok(owner, 'decide_report', { reportId: payload.reportId, accept: true, reason: null });
      const { statement, position } = await viewSettlement(database, driver, tripDayId);
      expect(statement.excused).toBe(true);
      expect(statement.owedForDay).toBe(0);
      expect(statement.ownerShare).toBe(20_000);
      expect(statement.driverShare).toBe(10_000);
      expect(statement.provisional).toBe(false);
      expect(position.state).toBe('nothing_owed');
    });

    it('carries nothing forward from an excused day, but still carries a rejected one', async () => {
      const tripDayId = await shortDay();
      const rejected = report();
      await ok(driver, 'report_day', rejected);
      await ok(owner, 'decide_report', { reportId: rejected.reportId, accept: false, reason: 'No evidence' });
      const next = await workDay('2026-11-03', 50_000);
      expect((await viewSettlement(database, owner, next.tripDayId)).statement.arrearsBroughtForward).toBe(30_000);

      const again = report({ reason: 'Here is the mechanic' });
      await ok(driver, 'report_day', again);
      await ok(owner, 'decide_report', { reportId: again.reportId, accept: true, reason: null });
      expect((await viewSettlement(database, owner, next.tripDayId)).statement.arrearsBroughtForward).toBe(0);
      expect((await viewSettlement(database, owner, tripDayId)).statement.owedForDay).toBe(0);
    });

    it('records a sick day with no work at all, which owes nothing', async () => {
      const payload = report({ kind: 'sick', reason: 'Malaria' });
      await ok(driver, 'report_day', payload);
      await ok(owner, 'decide_report', { reportId: payload.reportId, accept: true, reason: null });
      const row = await pg.query('select status from day_reports_v where id = $1', [payload.reportId]);
      expect(row.rows[0]).toMatchObject({ status: 'accepted' });
      const next = await workDay('2026-11-03', 50_000);
      expect((await viewSettlement(database, owner, next.tripDayId)).statement.arrearsBroughtForward).toBe(0);
    });

    it('refuses what the rules forbid', async () => {
      const byOwner = await run(owner, 'report_day', report());
      expect(byOwner).toMatchObject({ ok: false, code: 'report.only_driver_reports' });
      const future = await run(driver, 'report_day', report({ serviceDate: '2026-12-25' }));
      expect(future).toMatchObject({ ok: false, code: 'report.date_in_future' });

      const payload = report();
      await ok(driver, 'report_day', payload);
      const twice = await run(driver, 'report_day', report());
      expect(twice).toMatchObject({ ok: false, code: 'report.already_reported' });

      const byDriver = await run(driver, 'decide_report', { reportId: payload.reportId, accept: true, reason: null });
      expect(byDriver).toMatchObject({ ok: false, code: 'access.owner_only' });
      const noReason = await run(owner, 'decide_report', { reportId: payload.reportId, accept: false, reason: '' });
      expect(noReason).toMatchObject({ ok: false, code: 'report.reason_required' });

      await ok(owner, 'decide_report', { reportId: payload.reportId, accept: true, reason: null });
      const decidedTwice = await run(owner, 'decide_report', { reportId: payload.reportId, accept: false, reason: 'Changed my mind' });
      expect(decidedTwice).toMatchObject({ ok: false, code: 'report.already_decided' });
    });
  });

  it('takes approved costs off the cashing: K500 target, K80 fuel, K800 taken', async () => {
    const tripDayId = randomUUID();
    await ok(driver, 'start_day', { tripDayId, vehicleId, serviceDate: '2026-11-02', odometerStart: 1 });
    const entry = takings(tripDayId, 80_000);
    await ok(driver, 'record_handover', entry);
    await ok(owner, 'decide_handover', { entryId: entry.entryId, decision: 'confirm', reason: null });
    const expenseId = await logFuel(tripDayId, 8_000);
    await ok(owner, 'decide_expense', { expenseId, accept: true, reason: null });
    const { statement } = await viewSettlement(database, owner, tripDayId);
    expect(statement.ownerShare).toBe(42_000);
    expect(statement.driverShare).toBe(30_000);
    expect(statement.amountOwed).toBe(42_000);
  });

  describe('the owner answering a cost', () => {
    async function dayWithCost() {
      const { tripDayId } = await workDay('2026-11-02', 80_000);
      return { tripDayId, expenseId: await logFuel(tripDayId, 20_000) };
    }

    it('does not count a cost until it is approved, and keeps the day not final', async () => {
      const { tripDayId, expenseId } = await dayWithCost();
      const waiting = await viewSettlement(database, owner, tripDayId);
      expect(waiting.statement.expensesBorneByOwner).toBe(0);
      expect(waiting.statement.provisional).toBe(true);
      expect(waiting.statement.pendingExpenseIds).toEqual([expenseId]);

      await ok(owner, 'decide_expense', { expenseId, accept: true, reason: null });
      const approved = await viewSettlement(database, driver, tripDayId);
      expect(approved.statement.expensesBorneByOwner).toBe(20_000);
      expect(approved.statement.provisional).toBe(false);
    });

    it('leaves a rejected cost out, and needs a reason', async () => {
      const { tripDayId, expenseId } = await dayWithCost();
      const noReason = await run(owner, 'decide_expense', { expenseId, accept: false, reason: ' ' });
      expect(noReason).toMatchObject({ ok: false, code: 'expense.decline_reason_required' });

      await ok(owner, 'decide_expense', { expenseId, accept: false, reason: 'No receipt and too high' });
      const { statement } = await viewSettlement(database, owner, tripDayId);
      expect(statement.expensesBorneByOwner).toBe(0);
      expect(statement.provisional).toBe(false);
    });

    it('can only be answered by the owner, and only once', async () => {
      const { expenseId } = await dayWithCost();
      const byDriver = await run(driver, 'decide_expense', { expenseId, accept: true, reason: null });
      expect(byDriver).toMatchObject({ ok: false, code: 'access.owner_only' });

      await ok(owner, 'decide_expense', { expenseId, accept: true, reason: null });
      const twice = await run(owner, 'decide_expense', { expenseId, accept: false, reason: 'Changed my mind' });
      expect(twice).toMatchObject({ ok: false, code: 'expense.already_decided' });
    });
  });

  describe('one driver per bus', () => {
    async function secondDriverOffer() {
      const second = await createUser(pg, '+260960000002');
      const { code } = await ok(owner, 'create_invite', { role: 'driver' });
      await ok(second, 'join_business', { code }, null);
      const arrangementId = randomUUID();
      await ok(owner, 'propose_arrangement', {
        arrangementId, vehicleId, driverId: second, type: 'fixed_target', terms: { dailyTarget: 40_000 },
        fuelBearer: 'driver', otherCostsBearer: 'driver', fuelFloat: null, effectiveFrom: '2026-11-01',
      });
      return { second, arrangementId };
    }

    it('takes the bus off the old driver when a new one accepts', async () => {
      const { second, arrangementId } = await secondDriverOffer();
      await ok(second, 'respond_arrangement', { arrangementId, accept: true, reason: null });

      const old = await run(driver, 'start_day', { tripDayId: randomUUID(), vehicleId, serviceDate: '2026-11-02', odometerStart: 1 });
      expect(old).toMatchObject({ ok: false, code: 'day.no_active_arrangement' });
      await ok(second, 'start_day', { tripDayId: randomUUID(), vehicleId, serviceDate: '2026-11-02', odometerStart: 1 });

      const active = await pg.query(`select 1 from arrangements where vehicle_id = $1 and status = 'active'`, [vehicleId]);
      expect(active.rows).toHaveLength(1);
    });

    it('leaves the old driver in place until the new one accepts, and if they decline', async () => {
      const { second, arrangementId } = await secondDriverOffer();
      await ok(driver, 'start_day', { tripDayId: randomUUID(), vehicleId, serviceDate: '2026-11-02', odometerStart: 1 });
      const refused = await run(second, 'respond_arrangement', { arrangementId, accept: true, reason: null });
      expect(refused).toMatchObject({ ok: false, code: 'arrangement.bus_in_use' });

      await ok(second, 'respond_arrangement', { arrangementId, accept: false, reason: 'No thanks' });
      const active = await pg.query<{ driver_id: string }>(
        `select driver_id from arrangements where vehicle_id = $1 and status = 'active'`,
        [vehicleId],
      );
      expect(active.rows.map((r) => r.driver_id)).toEqual([driver]);
    });

    it('closes other offers on the bus when one is accepted', async () => {
      const { second, arrangementId } = await secondDriverOffer();
      const otherOffer = randomUUID();
      await ok(owner, 'propose_arrangement', {
        arrangementId: otherOffer, vehicleId, driverId: driver, type: 'fixed_target', terms: { dailyTarget: 45_000 },
        fuelBearer: 'driver', otherCostsBearer: 'driver', fuelFloat: null, effectiveFrom: '2026-11-01',
      });
      await ok(second, 'respond_arrangement', { arrangementId, accept: true, reason: null });
      const late = await run(driver, 'respond_arrangement', { arrangementId: otherOffer, accept: true, reason: null });
      expect(late).toMatchObject({ ok: false, code: 'arrangement.already_decided' });
    });
  });

  describe('undoing a confirmed payment', () => {
    async function paidDay() {
      const { tripDayId } = await workDay('2026-11-02', 80_000, 20_000);
      const paymentId = randomUUID();
      await ok(driver, 'claim_payment', { paymentId, tripDayId, amount: 30_000, method: 'cash' });
      await ok(owner, 'decide_payment', { paymentId, accept: true, confirmedAmount: 30_000, reason: null });
      return { tripDayId, paymentId };
    }

    it('makes the money owed again, here and on the next day, and keeps the history', async () => {
      const { tripDayId, paymentId } = await paidDay();
      const undone = await ok(owner, 'reverse_payment', { paymentId, reason: 'Tapped yes by mistake' });
      expect(undone).toMatchObject({ state: 'unpaid', remaining: 30_000 });

      const view = await viewSettlement(database, driver, tripDayId);
      expect(view.payments[0]).toMatchObject({ id: paymentId, status: 'reversed' });
      expect(view.position.remaining).toBe(30_000);

      const next = await workDay('2026-11-03', 50_000);
      const nextView = await viewSettlement(database, owner, next.tripDayId);
      expect(nextView.statement.arrearsBroughtForward).toBe(30_000);

      const audit = await pg.query('select 1 from audit_entries where entity_id = $1', [paymentId]);
      expect(audit.rows).toHaveLength(1);
    });

    it('lets the driver record the real payment afterwards', async () => {
      const { tripDayId, paymentId } = await paidDay();
      await ok(owner, 'reverse_payment', { paymentId, reason: 'Tapped yes by mistake' });
      await ok(driver, 'claim_payment', { paymentId: randomUUID(), tripDayId, amount: 30_000, method: 'cash' });
    });

    it('can only be done by the person paid, only on a confirmed payment, and only once', async () => {
      const { tripDayId, paymentId } = await paidDay();
      const byPayer = await run(driver, 'reverse_payment', { paymentId, reason: 'x' });
      expect(byPayer).toMatchObject({ ok: false, code: 'payment.only_payee_decides' });

      await ok(owner, 'reverse_payment', { paymentId, reason: 'Mistake' });
      const twice = await run(owner, 'reverse_payment', { paymentId, reason: 'Again' });
      expect(twice).toMatchObject({ ok: false, code: 'payment.already_reversed' });

      const claimedId = randomUUID();
      await ok(driver, 'claim_payment', { paymentId: claimedId, tripDayId, amount: 10_000, method: 'cash' });
      const notConfirmed = await run(owner, 'reverse_payment', { paymentId: claimedId, reason: 'Too early' });
      expect(notConfirmed).toMatchObject({ ok: false, code: 'payment.not_confirmed' });
    });
  });

  describe('resolving a disputed entry', () => {
    async function disputedDay() {
      const { tripDayId } = await workDay('2026-11-02', 80_000);
      const entry = takings(tripDayId, 30_000);
      await ok(driver, 'record_handover', entry);
      await ok(owner, 'decide_handover', { entryId: entry.entryId, decision: 'dispute', reason: 'I saw K20' });
      const view = await viewSettlement(database, owner, tripDayId);
      expect(view.statement.grossIncome).toBe(80_000);
      expect(view.statement.provisional).toBe(true);
      return { tripDayId, entryId: entry.entryId };
    }
    const correct = (originalId: string, amount: number) =>
      ok(owner, 'correct_entry', {
        entryType: 'income', originalId, reversalId: randomUUID(), replacementId: randomUUID(),
        amount, borneBy: null, reason: 'Agreed with the driver',
      });

    it('counts only the corrected amount, and the day is no longer provisional', async () => {
      const { tripDayId, entryId } = await disputedDay();
      await correct(entryId, 20_000);
      const { statement } = await viewSettlement(database, driver, tripDayId);
      expect(statement.grossIncome).toBe(100_000);
      expect(statement.provisional).toBe(false);
    });

    it('can remove the entry altogether, without taking anything off the day', async () => {
      const { tripDayId, entryId } = await disputedDay();
      await correct(entryId, 0);
      const { statement } = await viewSettlement(database, owner, tripDayId);
      expect(statement.grossIncome).toBe(80_000);
      expect(statement.provisional).toBe(false);
    });

    it('cannot be done twice, and an entry nobody has checked cannot be corrected', async () => {
      const { tripDayId, entryId } = await disputedDay();
      await correct(entryId, 20_000);
      const again = await run(owner, 'correct_entry', {
        entryType: 'income', originalId: entryId, reversalId: randomUUID(), replacementId: randomUUID(),
        amount: 10_000, borneBy: null, reason: 'Again',
      });
      expect(again).toMatchObject({ ok: false, code: 'correction.already_corrected' });

      const unchecked = takings(tripDayId, 5_000);
      await ok(driver, 'record_handover', unchecked);
      const early = await run(owner, 'correct_entry', {
        entryType: 'income', originalId: unchecked.entryId, reversalId: randomUUID(), replacementId: randomUUID(),
        amount: 1_000, borneBy: null, reason: 'Too early',
      });
      expect(early).toMatchObject({ ok: false, code: 'correction.entry_not_locked' });
    });
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
