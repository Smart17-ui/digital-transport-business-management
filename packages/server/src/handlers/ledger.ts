import {
  AcceptAllPolicy,
  assertCanDecide,
  buildExpense,
  correctExpense,
  correctIncome,
  invariant,
  TripDay,
  VehicleStatusPolicy,
  type ApprovalPolicy,
  type CommandPayload,
  type Expense,
  type ExpenseKind,
  type IncomeEntry,
  type Party,
  type PartyKind,
} from '@dt/domain';
import { emit, requireBusiness, requireDayParty, requireOwner, type CommandContext } from '../context.ts';
import { maybeOne, one, str, type Db } from '../db.ts';
import {
  enabledPaymentMethods,
  loadArrangement,
  loadTripDay,
  statusHistory,
  toExpense,
  toIncomeEntry,
} from '../repositories.ts';
import { refreshSettlement } from '../settlement-service.ts';

/**
 * Version 0 accepts every expense; Version 1 swaps in FloatApprovalPolicy here
 * and nothing else changes (design 8.2).
 */
export const approvalPolicy: ApprovalPolicy = new AcceptAllPolicy();

/** UC11 steps 1-4 */
export async function startDay(ctx: CommandContext, p: CommandPayload<'start_day'>) {
  const { businessId, ownerId } = requireBusiness(ctx);
  invariant(ctx.role === 'driver', 'day.only_driver_starts');
  await one(ctx.db, 'select 1 from vehicles where id = $1', [p.vehicleId], 'vehicle.not_found');
  const open = await maybeOne(ctx.db, 'select 1 from trip_days where vehicle_id = $1 and ended_at is null', [
    p.vehicleId,
  ]);
  const arrangement = await maybeOne(
    ctx.db,
    `select id from arrangements
     where vehicle_id = $1 and driver_id = $2 and status = 'active' and effective_from <= $3
     order by effective_from desc limit 1`,
    [p.vehicleId, ctx.userId, p.serviceDate],
  );
  const day = TripDay.start(
    {
      id: p.tripDayId,
      businessId,
      vehicleId: p.vehicleId,
      driverId: ctx.userId,
      serviceDate: p.serviceDate,
      odometerStart: p.odometerStart,
      at: ctx.now,
    },
    {
      openDayOnVehicle: open !== null,
      vehicleStatus: new VehicleStatusPolicy(await statusHistory(ctx.db, p.vehicleId)).currentStatus(),
      activeArrangementId: arrangement === null ? null : str(arrangement.id),
    },
  );
  const s = day.snapshot;
  await ctx.db.query(
    `insert into trip_days (id, business_id, vehicle_id, driver_id, arrangement_id, service_date,
       odometer_start, started_at, device_started_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [s.id, s.businessId, s.vehicleId, s.driverId, s.arrangementId, s.serviceDate, s.odometerStart, s.startedAt, ctx.deviceTime],
  );
  emit(ctx, { type: 'DayStarted', businessId, subjectUserId: ownerId, entityId: s.id, link: `/days/${s.id}` });
  return { tripDayId: s.id, arrangementId: s.arrangementId };
}

/** UC11 steps 5-6: closes the day and starts the settlement calculation. */
export async function endDay(ctx: CommandContext, p: CommandPayload<'end_day'>) {
  const day = await loadTripDay(ctx.db, p.tripDayId);
  const { businessId, ownerId } = requireDayParty(ctx, day);
  const distance = day.end(p.odometerEnd, ctx.now);
  await ctx.db.query('update trip_days set odometer_end = $1, ended_at = $2, device_ended_at = $3 where id = $4', [
    p.odometerEnd,
    ctx.now,
    ctx.deviceTime,
    p.tripDayId,
  ]);
  const statement = await refreshSettlement(ctx.db, p.tripDayId);
  emit(ctx, {
    type: 'DayClosed',
    businessId,
    subjectUserId: ctx.userId === ownerId ? day.snapshot.driverId : ownerId,
    entityId: p.tripDayId,
    link: `/days/${p.tripDayId}/settlement`,
  });
  return { tripDayId: p.tripDayId, distance, provisional: statement.provisional };
}

/** UC8 step 5 */
export async function recordHandover(ctx: CommandContext, p: CommandPayload<'record_handover'>) {
  const day = await loadTripDay(ctx.db, p.tripDayId);
  const { businessId, ownerId } = requireDayParty(ctx, day);
  // Parties are resolved from roles on the server; user ids from the phone are not trusted.
  const resolve = (kind: PartyKind): Party => ({
    kind,
    userId: kind === 'driver' ? day.snapshot.driverId : kind === 'owner' ? ownerId : null,
  });
  const entry = day.recordHandover(
    {
      id: p.entryId,
      kind: p.kind,
      amount: p.amount,
      method: p.method,
      giver: resolve(p.giver.kind),
      receiver: resolve(p.receiver.kind),
      recordedBy: ctx.userId,
    },
    await enabledPaymentMethods(ctx.db),
  );
  await insertIncome(ctx.db, businessId, entry, ctx.deviceTime);
  await refreshSettlement(ctx.db, p.tripDayId);
  emit(ctx, {
    type: 'HandoverRecorded',
    businessId,
    subjectUserId: ctx.userId === ownerId ? day.snapshot.driverId : ownerId,
    entityId: entry.id,
    link: `/days/${p.tripDayId}`,
  });
  return { entryId: entry.id, status: entry.status, late: entry.late };
}

/** UC8 steps 6-7 and 6b: confirmation or dispute is a new row; the entry is never updated. */
export async function decideHandover(ctx: CommandContext, p: CommandPayload<'decide_handover'>) {
  const { businessId, ownerId } = requireBusiness(ctx);
  const entry = toIncomeEntry(
    await one(ctx.db, 'select * from income_entries_v where id = $1', [p.entryId], 'entry.not_found'),
  );
  assertCanDecide(entry, ctx.userId, ownerId);
  const decision = p.decision === 'confirm' ? 'confirmed' : 'disputed';
  await ctx.db.query(
    `insert into entry_confirmations (business_id, entry_id, decision, reason, decided_by, decided_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [businessId, entry.id, decision, p.reason, ctx.userId, ctx.now],
  );
  const statement = await refreshSettlement(ctx.db, entry.tripDayId);
  emit(ctx, {
    type: decision === 'confirmed' ? 'HandoverConfirmed' : 'HandoverDisputed',
    businessId,
    subjectUserId: entry.recordedBy,
    entityId: entry.id,
    link: `/days/${entry.tripDayId}`,
  });
  return { entryId: entry.id, status: decision, grossIncome: statement.grossIncome };
}

/** UC12 and UC13 */
export async function logExpense(ctx: CommandContext, p: CommandPayload<'log_expense'>) {
  const { businessId, ownerId } = requireBusiness(ctx);
  const category = await one(
    ctx.db,
    'select kind from expense_categories where code = $1',
    [p.category],
    'expense.unknown_category',
  );
  if (p.receiptPath !== null) {
    // Receipts live in the business's private storage folder.
    invariant(p.receiptPath.startsWith(`${businessId}/`), 'expense.receipt_outside_business');
  }
  const input = {
    id: p.expenseId,
    vehicleId: p.vehicleId,
    category: p.category,
    kind: str(category.kind) as ExpenseKind,
    amount: p.amount,
    litres: p.litres,
    paidBy: p.paidBy,
    note: p.note,
    receiptPath: p.receiptPath,
    recordedBy: ctx.userId,
    borneByOverride: p.borneByOverride,
  };
  const isOwner = ctx.role === 'owner';

  let expense: Expense;
  if (p.tripDayId === null) {
    // UC12 3a: an owner-paid cost outside any day, never in a daily settlement.
    requireOwner(ctx);
    await one(ctx.db, 'select 1 from vehicles where id = $1', [p.vehicleId], 'vehicle.not_found');
    const costs = { fuelBearer: 'owner', otherCostsBearer: 'owner', fuelFloat: null } as const;
    expense = buildExpense(input, null, false, costs, approvalPolicy, isOwner);
  } else {
    const day = await loadTripDay(ctx.db, p.tripDayId);
    requireDayParty(ctx, day);
    invariant(day.snapshot.vehicleId === p.vehicleId, 'expense.vehicle_mismatch');
    const { costs } = await loadArrangement(ctx.db, day.snapshot.arrangementId);
    expense = day.recordExpense(input, costs, approvalPolicy, isOwner);
  }
  await insertExpense(ctx.db, businessId, expense, ctx.deviceTime, null);
  if (expense.tripDayId !== null) await refreshSettlement(ctx.db, expense.tripDayId);
  if (!isOwner) {
    emit(ctx, {
      type: 'ExpenseLogged',
      businessId,
      subjectUserId: ownerId,
      entityId: expense.id,
      link: expense.tripDayId ? `/days/${expense.tripDayId}` : '/expenses',
    });
  }
  return { expenseId: expense.id, status: expense.state.status, borneBy: expense.borneBy };
}

/** UC10: reversing and replacement entries, an audit entry, and a recalculation. */
export async function correctEntry(ctx: CommandContext, p: CommandPayload<'correct_entry'>) {
  const { businessId } = requireOwner(ctx);
  const request = {
    reversalId: p.reversalId,
    replacementId: p.replacementId,
    amount: p.amount,
    reason: p.reason,
    actorId: ctx.userId,
  };
  let tripDayId: string | null;
  let before: unknown;

  if (p.entryType === 'income') {
    const original = toIncomeEntry(
      await one(ctx.db, 'select * from income_entries_v where id = $1', [p.originalId], 'entry.not_found'),
    );
    const corrected = await maybeOne(ctx.db, 'select 1 from income_entries where reverses_id = $1', [original.id]);
    const { reversal, replacement } = correctIncome(original, request, corrected !== null);
    for (const entry of [reversal, replacement]) {
      if (entry === null) continue;
      await insertIncome(ctx.db, businessId, entry, ctx.deviceTime);
      await ctx.db.query(
        `insert into entry_confirmations (business_id, entry_id, decision, decided_by, decided_at)
         values ($1, $2, 'confirmed', $3, $4)`,
        [businessId, entry.id, ctx.userId, ctx.now],
      );
    }
    tripDayId = original.tripDayId;
    before = { amount: original.amount };
  } else {
    const original = toExpense(
      await one(ctx.db, 'select * from expenses_v where id = $1', [p.originalId], 'entry.not_found'),
    );
    const corrected = await maybeOne(ctx.db, 'select 1 from expenses where reverses_id = $1', [original.id]);
    const { reversal, replacement } = correctExpense(
      original,
      { ...request, borneBy: p.borneBy ?? original.borneBy },
      corrected !== null,
    );
    for (const expense of [reversal, replacement]) {
      if (expense !== null) await insertExpense(ctx.db, businessId, expense, ctx.deviceTime, ctx.userId);
    }
    tripDayId = original.tripDayId;
    before = { amount: original.amount, borneBy: original.borneBy, status: original.state.status };
  }

  await ctx.db.query(
    `insert into audit_entries (business_id, entity_type, entity_id, action, actor_id, reason, details, at)
     values ($1, $2, $3, 'correct', $4, $5, $6::text::jsonb, $7)`,
    [
      businessId,
      p.entryType === 'income' ? 'income_entry' : 'expense',
      p.originalId,
      ctx.userId,
      p.reason,
      JSON.stringify({ before, after: { amount: p.amount, borneBy: p.borneBy }, reversalId: p.reversalId,
        replacementId: p.amount === 0 ? null : p.replacementId }),
      ctx.now,
    ],
  );
  if (tripDayId !== null) {
    await refreshSettlement(ctx.db, tripDayId);
    const day = await loadTripDay(ctx.db, tripDayId);
    emit(ctx, {
      type: 'EntryCorrected',
      businessId,
      subjectUserId: day.snapshot.driverId,
      entityId: p.originalId,
      link: `/days/${tripDayId}`,
    });
  }
  return { reversalId: p.reversalId, replacementId: p.amount === 0 ? null : p.replacementId };
}

async function insertIncome(db: Db, businessId: string, e: IncomeEntry, deviceTime: string): Promise<void> {
  await db.query(
    `insert into income_entries (id, business_id, trip_day_id, kind, amount_ngwee, method, giver_kind,
       giver_user_id, receiver_kind, receiver_user_id, recorded_by, source, late, reverses_id, replaces_id,
       device_time)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      e.id, businessId, e.tripDayId, e.kind, e.amount, e.method, e.giver.kind, e.giver.userId, e.receiver.kind,
      e.receiver.userId, e.recordedBy, e.source, e.late, e.reversesId, e.replacesId, deviceTime,
    ],
  );
}

/** decidedBy is null when the ApprovalPolicy decided, the Owner's id for a correction. */
async function insertExpense(
  db: Db,
  businessId: string,
  x: Expense,
  deviceTime: string,
  decidedBy: string | null,
): Promise<void> {
  await db.query(
    `insert into expenses (id, business_id, trip_day_id, vehicle_id, category, amount_ngwee, litres, paid_by,
       borne_by, note, receipt_path, recorded_by, late, reverses_id, replaces_id, device_time)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      x.id, businessId, x.tripDayId, x.vehicleId, x.category, x.amount, x.litres, x.paidBy, x.borneBy, x.note,
      x.receiptPath, x.recordedBy, x.late, x.reversesId, x.replacesId, deviceTime,
    ],
  );
  if (x.state.status === 'pending') return;
  await db.query(
    `insert into expense_decisions (business_id, expense_id, decision, approved_amount_ngwee, decided_by)
     values ($1, $2, $3, $4, $5)`,
    [businessId, x.id, x.state.status, x.state.approvedAmount, decidedBy],
  );
}
