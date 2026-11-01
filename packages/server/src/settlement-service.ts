import {
  calculateSettlement,
  DomainError,
  paymentPosition,
  VehicleStatusPolicy,
  type PaymentPosition,
  type SettlementPayment,
  type SettlementStatement,
  type TripDay,
  type TripDayProps,
} from '@dt/domain';
import { maybeOne, num, type Database, type Db } from './db.ts';
import { loadArrangement, loadTripDay, paymentsForDay, statusHistory } from './repositories.ts';

/** Arrears from the Driver's earlier days in the business (derived, never stored). */
export async function arrearsBefore(db: Db, day: TripDay): Promise<number> {
  const s = day.snapshot;
  const row = await maybeOne(
    db,
    `select coalesce(sum(owed_for_day_ngwee - paid_ngwee), 0) as arrears
     from day_balances
     where business_id = $1 and driver_id = $2 and trip_day_id <> $3
       and (service_date, started_at) < ($4::date, $5::timestamptz)`,
    [s.businessId, s.driverId, s.id, s.serviceDate, s.startedAt],
  );
  return num(row?.arrears);
}

/** UC16 steps 2-4 on the server: gather, apply the strategy, work out who owes whom. */
export async function computeStatement(db: Db, day: TripDay): Promise<SettlementStatement> {
  const s = day.snapshot;
  const { arrangement } = await loadArrangement(db, s.arrangementId);
  const targetApplies = new VehicleStatusPolicy(await statusHistory(db, s.vehicleId)).targetApplies(s.serviceDate);
  return calculateSettlement(day, arrangement, {
    targetApplies,
    arrearsBroughtForward: await arrearsBefore(db, day),
  });
}

/**
 * Appends a new statement version when anything that affects the day changed.
 * Arrears read the latest version of each day, so this runs inside every
 * command that touches a day's money.
 */
export async function refreshSettlement(db: Db, tripDayId: string): Promise<SettlementStatement> {
  const day = await loadTripDay(db, tripDayId);
  const statement = await computeStatement(db, day);
  const latest = await maybeOne(
    db,
    'select version, statement from settlements where trip_day_id = $1 order by version desc limit 1',
    [tripDayId],
  );
  const { arrearsBroughtForward: _bf, netBalance: _nb, whoOwesWhom: _w, amountOwed: _a, ...dayOnly } = statement;
  if (latest === null || JSON.stringify(sortKeys(latest.statement)) !== JSON.stringify(sortKeys(dayOnly))) {
    await db.query(
      `insert into settlements (business_id, trip_day_id, arrangement_id, version, owed_for_day_ngwee,
         net_balance_ngwee, provisional, statement)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        day.snapshot.businessId,
        tripDayId,
        day.snapshot.arrangementId,
        latest === null ? 1 : num(latest.version) + 1,
        statement.owedForDay,
        statement.netBalance,
        statement.provisional,
        JSON.stringify(dayOnly),
      ],
    );
  }
  return statement;
}

export interface SettlementView {
  tripDay: Readonly<TripDayProps>;
  statement: SettlementStatement;
  payments: SettlementPayment[];
  position: PaymentPosition;
}

/** UC16: the Owner sees any day in the business; a Driver only their own. */
export async function viewSettlement(database: Database, userId: string, tripDayId: string): Promise<SettlementView> {
  return database.asUser(userId, async (db) => {
    const day = await loadTripDay(db, tripDayId);
    const isOwner = await maybeOne(
      db,
      `select 1 from memberships where business_id = $1 and user_id = $2 and role = 'owner' and ended_at is null`,
      [day.snapshot.businessId, userId],
    );
    if (!isOwner && day.snapshot.driverId !== userId) throw new DomainError('day.not_found');
    const statement = await computeStatement(db, day);
    const payments = await paymentsForDay(db, tripDayId);
    return { tripDay: day.snapshot, statement, payments, position: paymentPosition(statement.netBalance, payments) };
  });
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}
