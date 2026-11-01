import { randomUUID } from 'node:crypto';
import {
  AcceptAllPolicy,
  TripDay,
  type CostTerms,
  type HandoverKind,
  type Ngwee,
  type PaidBy,
  type Party,
} from '../src/index.ts';

export const OWNER = randomUUID();
export const DRIVER = randomUUID();
export const owner: Party = { kind: 'owner', userId: OWNER };
export const driver: Party = { kind: 'driver', userId: DRIVER };
export const conductor: Party = { kind: 'conductor', userId: null };

export const ownerBearsFuel: CostTerms = { fuelBearer: 'owner', otherCostsBearer: 'owner', fuelFloat: null };

export function openDay(): TripDay {
  return TripDay.start(
    {
      id: randomUUID(),
      businessId: randomUUID(),
      vehicleId: randomUUID(),
      driverId: DRIVER,
      serviceDate: '2026-11-02',
      odometerStart: 10_000,
      at: '2026-11-02T05:00:00Z',
    },
    { openDayOnVehicle: false, vehicleStatus: 'active', activeArrangementId: randomUUID() },
  );
}

/** Records a handover and confirms it, as the Owner would. */
export function confirmed(day: TripDay, kind: HandoverKind, amount: Ngwee): void {
  const entry = day.recordHandover(
    {
      id: randomUUID(),
      kind,
      amount,
      method: 'cash',
      giver: kind === 'takings' ? conductor : driver,
      receiver: kind === 'takings' ? driver : owner,
      recordedBy: DRIVER,
    },
    ['cash'],
  );
  entry.status = 'confirmed';
}

export function expense(
  day: TripDay,
  amount: Ngwee,
  paidBy: PaidBy,
  costs: CostTerms = ownerBearsFuel,
  kind: 'fuel' | 'roadside' = 'fuel',
) {
  return day.recordExpense(
    {
      id: randomUUID(),
      vehicleId: day.snapshot.vehicleId,
      category: kind === 'fuel' ? 'fuel' : 'puncture',
      kind,
      amount,
      litres: null,
      paidBy,
      note: '',
      receiptPath: null,
      recordedBy: DRIVER,
      borneByOverride: null,
    },
    costs,
    new AcceptAllPolicy(),
    false,
  );
}
