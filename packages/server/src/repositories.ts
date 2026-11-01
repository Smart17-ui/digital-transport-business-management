import {
  ArrangementFactory,
  TripDay,
  expenseStateFrom,
  type Arrangement,
  type Bearer,
  type CostTerms,
  type EntrySource,
  type EntryStatus,
  type Expense,
  type ExpenseKind,
  type ExpenseStatus,
  type HandoverKind,
  type IncomeEntry,
  type PaidBy,
  type PartyKind,
  type SettlementPayment,
  type StatusChange,
  type TripDayProps,
  type VehicleStatus,
} from '@dt/domain';
import {
  isoDate,
  isoTime,
  isoTimeOrNull,
  num,
  numOrNull,
  one,
  str,
  strOrNull,
  type Db,
  type Row,
} from './db.ts';

export function toTripDayProps(r: Row): TripDayProps {
  return {
    id: str(r.id),
    businessId: str(r.business_id),
    vehicleId: str(r.vehicle_id),
    driverId: str(r.driver_id),
    arrangementId: str(r.arrangement_id),
    serviceDate: isoDate(r.service_date),
    odometerStart: num(r.odometer_start),
    odometerEnd: numOrNull(r.odometer_end),
    startedAt: isoTime(r.started_at),
    endedAt: isoTimeOrNull(r.ended_at),
  };
}

export function toIncomeEntry(r: Row): IncomeEntry {
  return {
    id: str(r.id),
    tripDayId: str(r.trip_day_id),
    kind: r.kind as HandoverKind,
    amount: num(r.amount_ngwee),
    method: str(r.method),
    giver: { kind: r.giver_kind as PartyKind, userId: strOrNull(r.giver_user_id) },
    receiver: { kind: r.receiver_kind as PartyKind, userId: strOrNull(r.receiver_user_id) },
    recordedBy: str(r.recorded_by),
    source: r.source as EntrySource,
    late: Boolean(r.late),
    reversesId: strOrNull(r.reverses_id),
    replacesId: strOrNull(r.replaces_id),
    status: r.status as EntryStatus,
  };
}

export function toExpense(r: Row): Expense {
  return {
    id: str(r.id),
    tripDayId: strOrNull(r.trip_day_id),
    vehicleId: str(r.vehicle_id),
    category: str(r.category),
    kind: r.kind as ExpenseKind,
    amount: num(r.amount_ngwee),
    litres: numOrNull(r.litres),
    paidBy: r.paid_by as PaidBy,
    borneBy: r.borne_by as Bearer,
    note: str(r.note),
    receiptPath: strOrNull(r.receipt_path),
    recordedBy: str(r.recorded_by),
    late: Boolean(r.late),
    reversesId: strOrNull(r.reverses_id),
    replacesId: strOrNull(r.replaces_id),
    state: expenseStateFrom(r.status as ExpenseStatus, numOrNull(r.approved_amount_ngwee), strOrNull(r.decision_reason)),
  };
}

export function toPayment(r: Row): SettlementPayment {
  return {
    id: str(r.id),
    tripDayId: str(r.trip_day_id),
    payer: r.payer as 'driver' | 'owner',
    amount: num(r.amount_ngwee),
    method: str(r.method),
    status: r.status as SettlementPayment['status'],
    confirmedAmount: numOrNull(r.confirmed_amount_ngwee),
  };
}

/** Repository for the TripDay aggregate: the day with all its entries. */
export async function loadTripDay(db: Db, id: string): Promise<TripDay> {
  const row = await one(db, 'select * from trip_days where id = $1', [id], 'day.not_found');
  const income = await db.query('select * from income_entries_v where trip_day_id = $1 order by server_time, id', [id]);
  const expenses = await db.query('select * from expenses_v where trip_day_id = $1 order by server_time, id', [id]);
  return TripDay.restore(toTripDayProps(row), income.rows.map(toIncomeEntry), expenses.rows.map(toExpense));
}

export interface LoadedArrangement {
  id: string;
  driverId: string;
  vehicleId: string;
  status: string;
  arrangement: Arrangement;
  costs: CostTerms;
}

export function toLoadedArrangement(r: Row): LoadedArrangement {
  return {
    id: str(r.id),
    driverId: str(r.driver_id),
    vehicleId: str(r.vehicle_id),
    status: str(r.status),
    arrangement: ArrangementFactory.create(str(r.type), r.terms),
    costs: {
      fuelBearer: r.fuel_bearer as Bearer,
      otherCostsBearer: r.other_costs_bearer as Bearer,
      fuelFloat: numOrNull(r.fuel_float_ngwee),
    },
  };
}

export async function loadArrangement(db: Db, id: string): Promise<LoadedArrangement> {
  return toLoadedArrangement(await one(db, 'select * from arrangements where id = $1', [id], 'arrangement.not_found'));
}

export async function statusHistory(db: Db, vehicleId: string): Promise<StatusChange[]> {
  const { rows } = await db.query(
    'select status, changed_at from vehicle_status_changes where vehicle_id = $1 order by changed_at',
    [vehicleId],
  );
  return rows.map((r) => ({ status: r.status as VehicleStatus, at: isoTime(r.changed_at) }));
}

export async function paymentsForDay(db: Db, tripDayId: string): Promise<SettlementPayment[]> {
  const { rows } = await db.query('select * from settlement_payments_v where trip_day_id = $1 order by claimed_at', [
    tripDayId,
  ]);
  return rows.map(toPayment);
}

export async function enabledPaymentMethods(db: Db): Promise<string[]> {
  const { rows } = await db.query<{ code: string }>('select code from payment_methods where enabled');
  return rows.map((r) => r.code);
}
