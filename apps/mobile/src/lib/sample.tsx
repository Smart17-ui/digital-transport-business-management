import {
  AcceptAllPolicy,
  ArrangementFactory,
  calculateSettlement,
  formatKwacha,
  sum,
  TripDay,
  type ArrangementType,
  type EntryStatus,
  type ExpenseKind,
  type HandoverKind,
  type SettlementStatement,
} from '@dt/domain';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Sample business for trying the screens before they are connected to Supabase.
 * The amounts are made up, but every total runs through the same domain code
 * the server uses. Replace this file with real reads and the command queue.
 */

export type Audience = 'owner' | 'driver';

interface SampleExpense {
  id: string;
  label: string;
  kind: ExpenseKind;
  category: string;
  amount: number;
  time: string;
  litres: number | null;
}

export interface Bus {
  id: string;
  plate: string;
  driver: string | null;
  arrangementLabel: string;
  type: ArrangementType;
  terms: Record<string, number>;
  offRoadReason: string | null;
  arrears: number;
  expenses: SampleExpense[];
}

export interface Entry {
  id: string;
  busId: string;
  kind: HandoverKind;
  amount: number;
  time: string;
  status: EntryStatus;
  /** False while the phone is offline and the entry is still queued. */
  sent: boolean;
  reason: string | null;
}

export interface BusDay {
  bus: Bus;
  statement: SettlementStatement;
  takings: number;
  costsPaidFromCash: number;
  /** The day's amount for the Owner plus arrears, before anything is handed over. */
  owedTotal: number;
  handedOver: number;
  waitingToConfirm: number;
  receivedByOwner: number;
  left: number;
  cashInHand: number;
  driverKeeps: number;
}

export const OWNER = 'Mr Banda';
export const CONDUCTOR = 'Peter';
export const TODAY = 'Sun 1 Nov';

export const BUSES: Bus[] = [
  {
    id: 'baf',
    plate: 'BAF 2314',
    driver: 'Joseph',
    arrangementLabel: 'Fixed target',
    type: 'fixed_target',
    terms: { dailyTarget: 90_000 },
    offRoadReason: null,
    arrears: 10_000,
    expenses: [
      { id: 'fuel', label: 'Fuel', kind: 'fuel', category: 'fuel', amount: 30_000, time: '13:15', litres: 12 },
      { id: 'puncture', label: 'Puncture repair', kind: 'roadside', category: 'repair', amount: 5_000, time: '15:02', litres: null },
    ],
  },
  {
    id: 'baj',
    plate: 'BAJ 771',
    driver: 'Mutale',
    arrangementLabel: '60/40 share',
    type: 'revenue_share',
    terms: { ownerShareBasisPoints: 6_000 },
    offRoadReason: null,
    arrears: 0,
    expenses: [],
  },
  {
    id: 'bcd',
    plate: 'BCD 109',
    driver: 'Chanda',
    arrangementLabel: 'Fixed target',
    type: 'fixed_target',
    terms: { dailyTarget: 80_000 },
    offRoadReason: null,
    arrears: 0,
    expenses: [],
  },
  {
    id: 'alb',
    plate: 'ALB 5520',
    driver: null,
    arrangementLabel: '',
    type: 'fixed_target',
    terms: { dailyTarget: 80_000 },
    offRoadReason: 'Garage, waiting for parts',
    arrears: 0,
    expenses: [],
  },
];

const entry = (
  id: string,
  busId: string,
  kind: HandoverKind,
  amount: number,
  time: string,
  status: EntryStatus,
): Entry => ({ id, busId, kind, amount, time, status, sent: true, reason: null });

const START: Entry[] = [
  entry('e1', 'baf', 'takings', 62_000, '12:40', 'confirmed'),
  entry('e2', 'baf', 'takings', 62_000, '16:05', 'confirmed'),
  entry('e3', 'baf', 'remittance', 45_000, '16:20', 'pending'),
  entry('e4', 'baj', 'takings', 98_000, '15:30', 'confirmed'),
  entry('e5', 'baj', 'remittance', 58_800, '16:00', 'confirmed'),
  entry('e6', 'bcd', 'takings', 126_000, '15:45', 'confirmed'),
  entry('e7', 'bcd', 'remittance', 80_000, '16:10', 'confirmed'),
];

export function busById(id: string): Bus {
  const bus = BUSES.find((b) => b.id === id);
  if (!bus) throw new Error(`Unknown sample bus: ${id}`);
  return bus;
}

/** Whole kwacha without ".00", but ngwee are always shown when there are any. */
export function money(amount: number): string {
  return formatKwacha(amount).replace(/\.00$/, '');
}

function settleBus(bus: Bus, entries: readonly Entry[]): BusDay {
  const day = TripDay.start(
    {
      id: `day-${bus.id}`,
      businessId: 'sample',
      vehicleId: bus.id,
      driverId: 'sample-driver',
      serviceDate: '2026-11-01',
      odometerStart: 184_320,
      at: '2026-11-01T04:10:00.000Z',
    },
    { openDayOnVehicle: false, vehicleStatus: 'active', activeArrangementId: 'sample-arrangement' },
  );
  for (const e of entries) {
    const takings = e.kind === 'takings';
    const recorded = day.recordHandover(
      {
        id: e.id,
        kind: e.kind,
        amount: e.amount,
        method: 'cash',
        giver: { kind: takings ? 'conductor' : 'driver', userId: null },
        receiver: { kind: takings ? 'driver' : 'owner', userId: null },
        recordedBy: 'sample-driver',
      },
      ['cash'],
    );
    recorded.status = e.status;
  }
  for (const x of bus.expenses) {
    day.recordExpense(
      {
        id: x.id,
        vehicleId: bus.id,
        category: x.category,
        kind: x.kind,
        amount: x.amount,
        litres: x.litres,
        paidBy: 'driver_cash',
        note: '',
        receiptPath: null,
        recordedBy: 'sample-driver',
        borneByOverride: null,
      },
      { fuelBearer: 'owner', otherCostsBearer: 'owner', fuelFloat: null },
      new AcceptAllPolicy(),
      false,
    );
  }
  const statement = calculateSettlement(day, ArrangementFactory.create(bus.type, bus.terms), {
    targetApplies: true,
    arrearsBroughtForward: bus.arrears,
  });

  const counted = entries.filter((e) => e.status !== 'disputed');
  const amounts = (list: readonly Entry[]) => sum(list.map((e) => e.amount));
  const takings = amounts(counted.filter((e) => e.kind === 'takings'));
  const remittances = counted.filter((e) => e.kind === 'remittance');
  const handedOver = amounts(remittances);
  const costsPaidFromCash = sum(bus.expenses.map((x) => x.amount));
  const owedTotal = statement.ownerShare + bus.arrears;
  const left = owedTotal - handedOver;
  const cashInHand = takings - costsPaidFromCash - handedOver;

  return {
    bus,
    statement,
    takings,
    costsPaidFromCash,
    owedTotal,
    handedOver,
    waitingToConfirm: amounts(remittances.filter((e) => e.status === 'pending')),
    receivedByOwner: amounts(remittances.filter((e) => e.status === 'confirmed')),
    left,
    cashInHand,
    driverKeeps: cashInHand - left,
  };
}

interface SampleState {
  offline: boolean;
  setOffline: (offline: boolean) => void;
  /** What this person can see: the Owner never sees entries still queued on the Driver's phone. */
  entriesFor: (busId: string, audience: Audience) => Entry[];
  dayFor: (busId: string, audience: Audience) => BusDay;
  entryById: (id: string) => Entry | undefined;
  record: (input: { busId: string; kind: HandoverKind; amount: number }) => void;
  decide: (id: string, status: 'confirmed' | 'disputed', reason: string | null) => void;
  reset: () => void;
}

const SampleContext = createContext<SampleState | null>(null);

export function SampleProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState(START);
  const [offline, setOfflineState] = useState(false);

  const value = useMemo<SampleState>(() => {
    const entriesFor = (busId: string, audience: Audience) =>
      entries.filter((e) => e.busId === busId && (audience === 'driver' || e.sent));
    return {
      offline,
      setOffline: (next) => {
        setOfflineState(next);
        // Coming back online sends whatever was queued, as the real queue will.
        if (!next) setEntries((list) => list.map((e) => ({ ...e, sent: true })));
      },
      entriesFor,
      dayFor: (busId, audience) => settleBus(busById(busId), entriesFor(busId, audience)),
      entryById: (id) => entries.find((e) => e.id === id),
      record: ({ busId, kind, amount }) => {
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setEntries((list) => [
          ...list,
          { id: `e${list.length + 1}`, busId, kind, amount, time, status: 'pending', sent: !offline, reason: null },
        ]);
      },
      decide: (id, status, reason) =>
        setEntries((list) => list.map((e) => (e.id === id ? { ...e, status, reason } : e))),
      reset: () => {
        setEntries(START);
        setOfflineState(false);
      },
    };
  }, [entries, offline]);

  return <SampleContext.Provider value={value}>{children}</SampleContext.Provider>;
}

export function useSample(): SampleState {
  const value = useContext(SampleContext);
  if (!value) throw new Error('useSample must be used inside SampleProvider');
  return value;
}
