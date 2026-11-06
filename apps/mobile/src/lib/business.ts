import {
  allocatePayments,
  type DayCost,
  type DayEntry,
  type DayView,
  type PaymentAllocation,
  type PaymentPosition,
  type SettlementPayment,
  type SettlementStatement,
} from '@dt/domain';
import { useFocusEffect } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import { useCallback, useState } from 'react';
import { localDate, type ArrangementRecord } from '@/lib/arrangements';
import { supabase } from '@/lib/supabase';

export const VEHICLE_TYPES = [
  { value: 'minibus', label: 'Minibus' },
  { value: 'coaster', label: 'Coaster' },
  { value: 'bus', label: 'Large bus' },
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number]['value'];

export interface Bus {
  id: string;
  plate: string;
  type: string;
  addedAt: string;
}

export interface Driver {
  id: string;
  name: string | null;
  phone: string | null;
  joinedAt: string;
}

/** The person who owns the business, for a driver to reach. */
export interface Owner {
  name: string | null;
  phone: string | null;
}

/** What a bus or a driver has done, from finished days. */
export interface WorkRecord {
  daysWorked: number;
  lastWorked: string | null;
  distance: number;
  lastOdometer: number | null;
}

/** An entry the Owner has not checked yet, with who and which bus it is about. */
export interface EntryToCheck {
  entry: DayEntry;
  vehicleId: string;
  driverId: string;
}

export const REPORT_KINDS = [
  { value: 'breakdown', label: 'Breakdown' },
  { value: 'off_road', label: 'Off the road' },
  { value: 'sick', label: 'Sick' },
  { value: 'other', label: 'Other' },
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number]['value'];

export function reportKindLabel(kind: string): string {
  return REPORT_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** A driver's explanation of a day, and the Owner's answer. */
export interface DayReport {
  id: string;
  vehicleId: string;
  driverId: string;
  serviceDate: string;
  kind: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
  decisionReason: string | null;
}

/** A cost waiting for the Owner's answer, with who and which bus it is about. */
export interface CostToCheck {
  cost: DayCost;
  vehicleId: string;
  driverId: string;
}

/** A payment someone says they made, waiting for the person it was paid to. */
export interface PaymentToCheck {
  id: string;
  tripDayId: string;
  amount: number;
  vehicleId: string;
  driverId: string;
  serviceDate: string;
}

export interface DaySettlement {
  statement: SettlementStatement;
  payments: SettlementPayment[];
  position: PaymentPosition;
  tripDay: { businessId: string; driverId: string; serviceDate: string; odometerEnd: number | null; endedAt: string | null };
  entries: DayEntry[];
  costs: DayCost[];
  /** All this driver's finished days, with later payments applied to the oldest debt first. */
  allocation: PaymentAllocation;
  /** The driver's newest finished day: the one whose balance is the running balance. */
  latestClosedId: string | null;
  /** Why a payment was refused or undone, by payment id. */
  paymentReasons: Record<string, string>;
  /** Each time an owner reopened this day, oldest first. */
  reopenings: { reason: string; previousOdometerEnd: number; reopenedAt: string }[];
  /** When the day started and ended: by the phone's clock, and when each reached the server. */
  times: { startedAt: string | null; endedAt: string | null; startSentAt: string | null; endSentAt: string | null };
}

/** A finished day in the history list. */
export interface HistoryDay {
  id: string;
  serviceDate: string;
  startedAt: string | null;
  endedAt: string | null;
  plate: string;
  driverName: string | null;
  distance: number | null;
  owedForDay: number;
  /** Still unpaid once all payments are applied oldest first. Negative: the owner owes. */
  left: number;
}

export const COST_CATEGORIES = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'puncture_tyre', label: 'Puncture or tyre' },
  { value: 'levy_toll', label: 'Levy or toll' },
  { value: 'parking', label: 'Parking' },
  { value: 'car_wash', label: 'Car wash' },
  { value: 'small_repair', label: 'Small repair' },
  { value: 'fine', label: 'Fine' },
  { value: 'other', label: 'Other' },
] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number]['value'];

export function costCategoryLabel(category: string): string {
  return COST_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export interface OwnerOverview {
  buses: Bus[];
  drivers: Driver[];
  arrangements: ArrangementRecord[];
  days: DayView[];
  entries: DayEntry[];
  costs: DayCost[];
  toCheck: EntryToCheck[];
  costsToCheck: CostToCheck[];
  paymentsToCheck: PaymentToCheck[];
  reportsToCheck: DayReport[];
}

export interface DriverOverview {
  owner: Owner | null;
  buses: Bus[];
  arrangements: ArrangementRecord[];
  days: DayView[];
  entries: DayEntry[];
  costs: DayCost[];
  paymentsToCheck: PaymentToCheck[];
  /** What each of this driver's days left owing, as last read, for the estimate when there is no signal. */
  balances: { id: string; left: number }[];
  /** True when this is the copy saved on the phone, because the server could not be reached. */
  saved: boolean;
}

export function vehicleTypeLabel(type: string): string {
  return VEHICLE_TYPES.find((t) => t.value === type)?.label ?? type;
}

async function fetchBuses(businessId: string): Promise<Bus[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, plate, vehicle_type, created_at')
    .eq('business_id', businessId)
    .order('created_at');
  if (error) throw error;
  return data.map((v) => ({ id: v.id, plate: v.plate, type: v.vehicle_type, addedAt: v.created_at }));
}

async function fetchOwner(businessId: string): Promise<Owner | null> {
  const business = await supabase.from('businesses').select('owner_id').eq('id', businessId).maybeSingle();
  if (business.error) throw business.error;
  if (!business.data) return null;
  const profile = await supabase.from('profiles').select('display_name, phone').eq('id', business.data.owner_id).maybeSingle();
  if (profile.error) throw profile.error;
  return { name: profile.data?.display_name ?? null, phone: profile.data?.phone ?? null };
}

async function fetchDrivers(businessId: string): Promise<Driver[]> {
  const memberships = await supabase
    .from('memberships')
    .select('user_id, joined_at')
    .eq('business_id', businessId)
    .eq('role', 'driver')
    .is('ended_at', null)
    .order('joined_at');
  if (memberships.error) throw memberships.error;

  const driverIds = memberships.data.map((m) => m.user_id as string);
  if (driverIds.length === 0) return [];
  const profiles = await supabase.from('profiles').select('id, display_name, phone').in('id', driverIds);
  if (profiles.error) throw profiles.error;

  return memberships.data.map((m) => {
    const profile = profiles.data.find((p) => p.id === m.user_id);
    return { id: m.user_id as string, name: profile?.display_name ?? null, phone: profile?.phone ?? null, joinedAt: m.joined_at as string };
  });
}

const ARRANGEMENT_COLUMNS =
  'id, vehicle_id, driver_id, type, terms, fuel_bearer, other_costs_bearer, effective_from, status, decline_reason';

function toArrangement(row: Record<string, unknown>): ArrangementRecord {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    driverId: row.driver_id,
    type: row.type,
    terms: row.terms,
    fuelBearer: row.fuel_bearer,
    otherCostsBearer: row.other_costs_bearer,
    effectiveFrom: row.effective_from,
    status: row.status,
    declineReason: row.decline_reason,
  } as ArrangementRecord;
}

/** What is in force or waiting. A decline only shows until the same bus and driver get a newer proposal. */
async function fetchArrangements(businessId: string): Promise<ArrangementRecord[]> {
  const { data, error } = await supabase
    .from('arrangements')
    .select(ARRANGEMENT_COLUMNS)
    .eq('business_id', businessId)
    .in('status', ['proposed', 'active', 'declined'])
    .order('proposed_at', { ascending: false });
  if (error) throw error;

  const seen = new Set<string>();
  return data.map(toArrangement).filter((a) => {
    const pair = `${a.vehicleId}/${a.driverId}`;
    const newest = !seen.has(pair);
    seen.add(pair);
    return a.status !== 'declined' || newest;
  });
}

const RECENT_DAYS = 7;

/** Days still running, whenever they began, and the last week's. Row level security limits a driver to their own. */
async function fetchDays(businessId: string): Promise<DayView[]> {
  const since = localDate(new Date(Date.now() - RECENT_DAYS * 86_400_000));
  const { data, error } = await supabase
    .from('trip_days')
    .select('id, vehicle_id, service_date, odometer_start, odometer_end, started_at, ended_at, device_started_at, device_ended_at')
    .eq('business_id', businessId)
    .or(`ended_at.is.null,service_date.gte.${since}`)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return data.map((d) => ({
    id: d.id,
    vehicleId: d.vehicle_id,
    serviceDate: d.service_date,
    odometerStart: d.odometer_start,
    odometerEnd: d.odometer_end,
    startedAt: d.device_started_at ?? d.started_at,
    endedAt: d.device_ended_at ?? d.ended_at,
    startSentAt: d.started_at,
    endSentAt: d.ended_at,
    unsent: false,
  }));
}

const ENTRY_COLUMNS = 'id, trip_day_id, kind, amount_ngwee, status, decision_reason, reverses_id, device_time, server_time';

function toEntry(row: Record<string, unknown>): DayEntry {
  return {
    id: row.id,
    tripDayId: row.trip_day_id,
    kind: row.kind,
    amount: Number(row.amount_ngwee),
    status: row.status,
    reason: row.decision_reason,
    reversesId: row.reverses_id,
    at: row.device_time ?? row.server_time,
    unsent: false,
  } as DayEntry;
}

async function fetchEntries(dayIds: string[]): Promise<DayEntry[]> {
  if (dayIds.length === 0) return [];
  const { data, error } = await supabase.from('income_entries_v').select(ENTRY_COLUMNS).in('trip_day_id', dayIds);
  if (error) throw error;
  return data.map(toEntry);
}

const COST_COLUMNS =
  'id, trip_day_id, category, reverses_id, amount_ngwee, litres, paid_by, borne_by, status, decision_reason, note, device_time, server_time';

function toCost(row: Record<string, unknown>): DayCost {
  return {
    id: row.id,
    tripDayId: row.trip_day_id,
    category: row.category,
    reversesId: row.reverses_id,
    amount: Number(row.amount_ngwee),
    litres: row.litres === null ? null : Number(row.litres),
    paidBy: row.paid_by,
    borneBy: row.borne_by,
    status: row.status,
    reason: row.decision_reason,
    note: row.note,
    at: row.device_time ?? row.server_time,
    unsent: false,
  } as DayCost;
}

async function fetchCosts(dayIds: string[]): Promise<DayCost[]> {
  if (dayIds.length === 0) return [];
  const { data, error } = await supabase.from('expenses_v').select(COST_COLUMNS).in('trip_day_id', dayIds);
  if (error) throw error;
  return data.map(toCost);
}

/** Every cost waiting for the Owner, from any date. */
async function fetchCostsToCheck(businessId: string): Promise<CostToCheck[]> {
  const pending = await supabase
    .from('expenses_v')
    .select(COST_COLUMNS)
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .order('server_time');
  if (pending.error) throw pending.error;
  if (pending.data.length === 0) return [];

  const costs = pending.data.map(toCost);
  const days = await supabase
    .from('trip_days')
    .select('id, vehicle_id, driver_id')
    .in('id', [...new Set(costs.map((c) => c.tripDayId))]);
  if (days.error) throw days.error;

  return costs.flatMap((cost) => {
    const day = days.data.find((d) => d.id === cost.tripDayId);
    return day ? [{ cost, vehicleId: day.vehicle_id as string, driverId: day.driver_id as string }] : [];
  });
}

/** One cost, with its bus and driver, for the Owner to answer. */
export async function fetchCostToCheck(id: string) {
  const row = await supabase.from('expenses_v').select(COST_COLUMNS).eq('id', id).maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) return { cost: null, plate: undefined, driverName: undefined };
  const cost = toCost(row.data);

  const day = await supabase.from('trip_days').select('vehicle_id, driver_id').eq('id', cost.tripDayId).single();
  if (day.error) throw day.error;
  const [vehicle, profile] = await Promise.all([
    supabase.from('vehicles').select('plate').eq('id', day.data.vehicle_id).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id', day.data.driver_id).maybeSingle(),
  ]);
  if (vehicle.error) throw vehicle.error;
  if (profile.error) throw profile.error;
  return { cost, plate: vehicle.data?.plate as string | undefined, driverName: profile.data?.display_name as string | null | undefined };
}

/** Everything waiting for the Owner, from any date, so an old entry is not forgotten. */
async function fetchEntriesToCheck(businessId: string): Promise<EntryToCheck[]> {
  const pending = await supabase
    .from('income_entries_v')
    .select(ENTRY_COLUMNS)
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .order('server_time');
  if (pending.error) throw pending.error;
  if (pending.data.length === 0) return [];

  const entries = pending.data.map(toEntry);
  const days = await supabase
    .from('trip_days')
    .select('id, vehicle_id, driver_id')
    .in('id', [...new Set(entries.map((e) => e.tripDayId))]);
  if (days.error) throw days.error;

  return entries.flatMap((entry) => {
    const day = days.data.find((d) => d.id === entry.tripDayId);
    return day ? [{ entry, vehicleId: day.vehicle_id as string, driverId: day.driver_id as string }] : [];
  });
}

/** Payments waiting for this person to answer, from any date. `payer` is the other side of the day. */
async function fetchPaymentsToCheck(businessId: string, payer: 'driver' | 'owner'): Promise<PaymentToCheck[]> {
  const claimed = await supabase
    .from('settlement_payments_v')
    .select('id, trip_day_id, amount_ngwee')
    .eq('business_id', businessId)
    .eq('payer', payer)
    .eq('status', 'claimed')
    .order('claimed_at');
  if (claimed.error) throw claimed.error;
  if (claimed.data.length === 0) return [];

  const days = await supabase
    .from('trip_days')
    .select('id, vehicle_id, driver_id, service_date')
    .in('id', [...new Set(claimed.data.map((p) => p.trip_day_id as string))]);
  if (days.error) throw days.error;

  return claimed.data.flatMap((p) => {
    const day = days.data.find((d) => d.id === p.trip_day_id);
    return day
      ? [
          {
            id: p.id as string,
            tripDayId: p.trip_day_id as string,
            amount: Number(p.amount_ngwee),
            vehicleId: day.vehicle_id as string,
            driverId: day.driver_id as string,
            serviceDate: day.service_date as string,
          },
        ]
      : [];
  });
}

const PAGE_SIZE = 1000;

/** Reads every page of a query, because a cut-off list of days would give wrong balances. */
async function allPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

interface ClosedDayRow {
  id: string;
  vehicle_id: string;
  driver_id: string;
  service_date: string;
  odometer_start: number;
  odometer_end: number | null;
  started_at: string;
  ended_at: string | null;
  device_started_at: string | null;
  device_ended_at: string | null;
}

/** Finished days, oldest first, in the same order arrears use. Row level security limits a driver to their own. */
async function fetchClosedDays(businessId: string, driverId?: string): Promise<ClosedDayRow[]> {
  return allPages<ClosedDayRow>((from, to) => {
    let query = supabase
      .from('trip_days')
      .select('id, vehicle_id, driver_id, service_date, odometer_start, odometer_end, started_at, ended_at, device_started_at, device_ended_at')
      .eq('business_id', businessId)
      .not('ended_at', 'is', null);
    if (driverId) query = query.eq('driver_id', driverId);
    return query.order('service_date').order('started_at').order('id').range(from, to);
  });
}

async function fetchBalances(businessId: string, driverId?: string) {
  const rows = await allPages<{ trip_day_id: string; owed_for_day_ngwee: number; paid_ngwee: number }>((from, to) => {
    let query = supabase
      .from('day_balances')
      .select('trip_day_id, owed_for_day_ngwee, paid_ngwee')
      .eq('business_id', businessId);
    if (driverId) query = query.eq('driver_id', driverId);
    return query.order('trip_day_id').range(from, to);
  });
  return new Map(rows.map((r) => [r.trip_day_id, { owedForDay: Number(r.owed_for_day_ngwee), paid: Number(r.paid_ngwee) }]));
}

function allocationFor(days: readonly ClosedDayRow[], balances: Awaited<ReturnType<typeof fetchBalances>>) {
  return allocatePayments(
    days.map((d) => ({ id: d.id, owedForDay: balances.get(d.id)?.owedForDay ?? 0, paid: balances.get(d.id)?.paid ?? 0 })),
  );
}

/** A bus's last known position, for the Owner's map. */
export interface VehiclePosition {
  vehicleId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  recordedAt: string;
  receivedAt: string;
}

/** Everything the live map shows. Small enough to read again every half minute. */
export async function fetchLiveMap(businessId: string) {
  const [buses, drivers, positions, running] = await Promise.all([
    fetchBuses(businessId),
    fetchDrivers(businessId),
    supabase
      .from('vehicle_last_positions')
      .select('vehicle_id, driver_id, latitude, longitude, speed_kmh, recorded_at, received_at')
      .eq('business_id', businessId),
    supabase.from('trip_days').select('vehicle_id').eq('business_id', businessId).is('ended_at', null),
  ]);
  if (positions.error) throw positions.error;
  if (running.error) throw running.error;
  return {
    buses,
    drivers,
    runningVehicleIds: running.data.map((d) => d.vehicle_id as string),
    positions: positions.data.map(
      (p): VehiclePosition => ({
        vehicleId: p.vehicle_id,
        driverId: p.driver_id,
        latitude: p.latitude,
        longitude: p.longitude,
        speedKmh: p.speed_kmh,
        recordedAt: p.recorded_at,
        receivedAt: p.received_at,
      }),
    ),
  };
}

/** `days` must be oldest first, as fetchClosedDays gives them. */
function workRecord(days: readonly ClosedDayRow[]): WorkRecord {
  const last = days[days.length - 1];
  return {
    daysWorked: days.length,
    lastWorked: last?.service_date ?? null,
    distance: days.reduce((sum, d) => sum + (d.odometer_end === null ? 0 : d.odometer_end - d.odometer_start), 0),
    lastOdometer: last?.odometer_end ?? null,
  };
}

export async function fetchBusRecord(businessId: string, busId: string): Promise<WorkRecord> {
  return workRecord((await fetchClosedDays(businessId)).filter((d) => d.vehicle_id === busId));
}

/** `balance` is the running balance across all their days. Positive: the driver owes the owner. */
export async function fetchDriverRecord(businessId: string, driverId: string): Promise<WorkRecord & { balance: number }> {
  const [days, balances] = await Promise.all([fetchClosedDays(businessId, driverId), fetchBalances(businessId, driverId)]);
  return { ...workRecord(days), balance: allocationFor(days, balances).balance };
}

/** The real settlement, worked out by the server, with the entries behind it. */
export async function fetchDaySettlement(tripDayId: string): Promise<DaySettlement> {
  const [view, entries, costs] = await Promise.all([
    supabase.functions.invoke<Pick<DaySettlement, 'statement' | 'payments' | 'position' | 'tripDay'>>(
      `command/settlement?tripDayId=${encodeURIComponent(tripDayId)}`,
      { method: 'GET' },
    ),
    fetchEntries([tripDayId]),
    fetchCosts([tripDayId]),
  ]);
  if (view.error || !view.data) throw view.error ?? new Error('No settlement returned');

  const { businessId, driverId } = view.data.tripDay;
  const [closedDays, balances, reasons, day, reopenings] = await Promise.all([
    fetchClosedDays(businessId, driverId),
    fetchBalances(businessId, driverId),
    supabase.from('settlement_payments_v').select('id, decision_reason, reversal_reason').eq('trip_day_id', tripDayId),
    supabase.from('trip_days').select('started_at, ended_at, device_started_at, device_ended_at').eq('id', tripDayId).single(),
    supabase.from('day_reopenings').select('reason, previous_odometer_end, reopened_at').eq('trip_day_id', tripDayId).order('reopened_at'),
  ]);
  if (reasons.error) throw reasons.error;
  if (reopenings.error) throw reopenings.error;
  if (day.error) throw day.error;
  return {
    ...view.data,
    entries,
    costs,
    allocation: allocationFor(closedDays, balances),
    latestClosedId: closedDays[closedDays.length - 1]?.id ?? null,
    paymentReasons: Object.fromEntries(
      reasons.data.flatMap((p) => {
        const reason = p.reversal_reason ?? p.decision_reason;
        return reason ? [[p.id as string, reason as string]] : [];
      }),
    ),
    reopenings: reopenings.data.map((r) => ({
      reason: r.reason as string,
      previousOdometerEnd: r.previous_odometer_end as number,
      reopenedAt: r.reopened_at as string,
    })),
    times: {
      startedAt: day.data.device_started_at ?? day.data.started_at,
      endedAt: day.data.device_ended_at ?? day.data.ended_at,
      startSentAt: day.data.started_at,
      endSentAt: day.data.ended_at,
    },
  };
}

const REPORT_COLUMNS = 'id, vehicle_id, driver_id, service_date, kind, reason, status, decision_reason';

function toReport(row: Record<string, unknown>): DayReport {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    driverId: row.driver_id,
    serviceDate: row.service_date,
    kind: row.kind,
    reason: row.reason,
    status: row.status,
    decisionReason: row.decision_reason,
  } as DayReport;
}

/** Row level security limits a driver to their own reports. */
async function fetchReports(businessId: string): Promise<DayReport[]> {
  const rows = await allPages<Record<string, unknown>>((from, to) =>
    supabase.from('day_reports_v').select(REPORT_COLUMNS).eq('business_id', businessId).order('service_date').order('id').range(from, to),
  );
  return rows.map(toReport);
}

async function fetchReportsToCheck(businessId: string): Promise<DayReport[]> {
  const { data, error } = await supabase
    .from('day_reports_v')
    .select(REPORT_COLUMNS)
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .order('created_at');
  if (error) throw error;
  return data.map(toReport);
}

/** One report, with its bus and driver, for the Owner to answer. */
export async function fetchReportToCheck(id: string) {
  const row = await supabase.from('day_reports_v').select(REPORT_COLUMNS).eq('id', id).maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) return { report: null, plate: undefined, driverName: undefined };
  const report = toReport(row.data);
  const [vehicle, profile] = await Promise.all([
    supabase.from('vehicles').select('plate').eq('id', report.vehicleId).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id', report.driverId).maybeSingle(),
  ]);
  if (vehicle.error) throw vehicle.error;
  if (profile.error) throw profile.error;
  return { report, plate: vehicle.data?.plate as string | undefined, driverName: profile.data?.display_name as string | null | undefined };
}

/** Everything the calendar shows: days worked and reports, with the names to label them. */
export async function fetchCalendar(businessId: string) {
  const [days, reports, buses, drivers] = await Promise.all([
    fetchHistory(businessId),
    fetchReports(businessId),
    fetchBuses(businessId),
    fetchDrivers(businessId),
  ]);
  return {
    days,
    reports: reports.map((report) => ({
      ...report,
      plate: buses.find((b) => b.id === report.vehicleId)?.plate ?? '',
      driverName: drivers.find((d) => d.id === report.driverId)?.name ?? null,
    })),
  };
}

/** Every finished day, newest first. Balances are worked out per driver, as arrears are. */
export async function fetchHistory(businessId: string): Promise<HistoryDay[]> {
  const [days, balances, buses, drivers] = await Promise.all([
    fetchClosedDays(businessId),
    fetchBalances(businessId),
    fetchBuses(businessId),
    fetchDrivers(businessId),
  ]);
  const left: Record<string, number> = {};
  for (const driverId of new Set(days.map((d) => d.driver_id))) {
    Object.assign(left, allocationFor(days.filter((d) => d.driver_id === driverId), balances).left);
  }
  return [...days].reverse().map((d) => ({
    id: d.id,
    serviceDate: d.service_date,
    startedAt: d.device_started_at ?? d.started_at,
    endedAt: d.device_ended_at ?? d.ended_at,
    plate: buses.find((b) => b.id === d.vehicle_id)?.plate ?? '',
    driverName: drivers.find((x) => x.id === d.driver_id)?.name ?? null,
    distance: d.odometer_end === null ? null : d.odometer_end - d.odometer_start,
    owedForDay: balances.get(d.id)?.owedForDay ?? 0,
    left: left[d.id] ?? 0,
  }));
}

/** One entry, with its bus and driver, for the Owner to check. */
export async function fetchEntryToCheck(id: string) {
  const row = await supabase.from('income_entries_v').select(ENTRY_COLUMNS).eq('id', id).maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) return { entry: null, plate: undefined, driverName: undefined };
  const entry = toEntry(row.data);

  const day = await supabase.from('trip_days').select('vehicle_id, driver_id').eq('id', entry.tripDayId).single();
  if (day.error) throw day.error;
  const [vehicle, profile] = await Promise.all([
    supabase.from('vehicles').select('plate').eq('id', day.data.vehicle_id).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id', day.data.driver_id).maybeSingle(),
  ]);
  if (vehicle.error) throw vehicle.error;
  if (profile.error) throw profile.error;
  return { entry, plate: vehicle.data?.plate as string | undefined, driverName: profile.data?.display_name as string | null | undefined };
}

/** One arrangement and its bus, whatever its status, for the driver to review. */
export async function fetchOffer(id: string): Promise<{ arrangement: ArrangementRecord | null; plate: string | null }> {
  const { data, error } = await supabase.from('arrangements').select(ARRANGEMENT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return { arrangement: null, plate: null };
  const arrangement = toArrangement(data);
  const vehicle = await supabase.from('vehicles').select('plate').eq('id', arrangement.vehicleId).maybeSingle();
  if (vehicle.error) throw vehicle.error;
  return { arrangement, plate: vehicle.data?.plate ?? null };
}

/** Runs `load`, and runs it again each time the screen comes back into view. Keep `load` stable with useCallback. */
export function useScreenData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await load());
      setFailed(false);
    } catch {
      setFailed(true);
    }
    setRefreshing(false);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { data, failed, refreshing, reload };
}

export function useOwnerOverview(businessId: string) {
  const load = useCallback(async (): Promise<OwnerOverview> => {
    const [buses, drivers, arrangements, days, toCheck, costsToCheck, paymentsToCheck, reportsToCheck] = await Promise.all([
      fetchBuses(businessId),
      fetchDrivers(businessId),
      fetchArrangements(businessId),
      fetchDays(businessId),
      fetchEntriesToCheck(businessId),
      fetchCostsToCheck(businessId),
      fetchPaymentsToCheck(businessId, 'driver'),
      fetchReportsToCheck(businessId),
    ]);
    const dayIds = days.map((d) => d.id);
    const [entries, costs] = await Promise.all([fetchEntries(dayIds), fetchCosts(dayIds)]);
    return { buses, drivers, arrangements, days, entries, costs, toCheck, costsToCheck, paymentsToCheck, reportsToCheck };
  }, [businessId]);
  return useScreenData(load);
}

/**
 * Row level security limits a driver's arrangements and days to their own, so no
 * other driver's terms are read. The last good copy is kept on the phone, because
 * a driver with no signal still needs to start and end the day.
 */
export function useDriverOverview(businessId: string, userId: string) {
  const load = useCallback(async (): Promise<DriverOverview> => {
    const key = `dt.driver-overview.${userId}.${businessId}`;
    try {
      const [owner, buses, arrangements, days, paymentsToCheck, balanceMap] = await Promise.all([
        fetchOwner(businessId),
        fetchBuses(businessId),
        fetchArrangements(businessId),
        fetchDays(businessId),
        fetchPaymentsToCheck(businessId, 'owner'),
        fetchBalances(businessId, userId),
      ]);
      const dayIds = days.map((d) => d.id);
      const [entries, costs] = await Promise.all([fetchEntries(dayIds), fetchCosts(dayIds)]);
      const balances = [...balanceMap].map(([id, b]) => ({ id, left: b.owedForDay - b.paid }));
      const overview = { owner, buses, arrangements, days, entries, costs, paymentsToCheck, balances, saved: false };
      await Storage.setItem(key, JSON.stringify(overview));
      return overview;
    } catch (failure) {
      const saved = await Storage.getItem(key);
      if (saved === null) throw failure;
      return {
        owner: null,
        entries: [],
        costs: [],
        paymentsToCheck: [],
        balances: [],
        ...(JSON.parse(saved) as Partial<DriverOverview>),
        saved: true,
      } as DriverOverview;
    }
  }, [businessId, userId]);
  return useScreenData(load);
}
