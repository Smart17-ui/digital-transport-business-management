import { describe, expect, it } from 'vitest';
import {
  applyQueuedDayCommands,
  applyQueuedEntries,
  currentDayForVehicle,
  sentLongAfter,
  summariseDay,
  type DayCost,
  type DayEntry,
  type DayView,
} from '../src/index.ts';

const entry = (over: Partial<DayEntry> = {}): DayEntry => ({
  id: 'entry-1',
  tripDayId: 'day-1',
  kind: 'takings',
  amount: 80_000,
  status: 'confirmed',
  reason: null,
  reversesId: null,
  at: '2026-11-03T08:00:00Z',
  unsent: false,
  ...over,
});

const cost = (over: Partial<DayCost> = {}): DayCost => ({
  id: 'cost-1',
  tripDayId: 'day-1',
  category: 'fuel',
  reversesId: null,
  amount: 20_000,
  litres: null,
  paidBy: 'driver_cash',
  status: 'approved',
  reason: null,
  note: '',
  at: '2026-11-03T09:00:00Z',
  unsent: false,
  ...over,
});

describe('applyQueuedEntries', () => {
  const handover = {
    type: 'record_handover',
    deviceTime: '2026-11-03T10:00:00Z',
    payload: {
      entryId: 'entry-1',
      tripDayId: 'day-1',
      kind: 'remittance',
      amount: 50_000,
      method: 'cash',
      giver: { kind: 'driver', userId: null },
      receiver: { kind: 'owner', userId: null },
    },
  };
  const expense = {
    type: 'log_expense',
    deviceTime: '2026-11-03T11:00:00Z',
    payload: {
      expenseId: 'cost-1',
      tripDayId: 'day-1',
      vehicleId: 'bus-1',
      category: 'fuel',
      amount: 20_000,
      litres: 15.5,
      paidBy: 'driver_cash',
      note: '',
      receiptPath: null,
      borneByOverride: null,
    },
  };

  it('shows queued entries and costs as waiting and unsent', () => {
    const { entries, costs } = applyQueuedEntries([], [], [handover, expense]);
    expect(entries).toEqual([
      entry({ kind: 'remittance', amount: 50_000, status: 'pending', at: '2026-11-03T10:00:00Z', unsent: true }),
    ]);
    expect(costs).toEqual([cost({ litres: 15.5, status: 'pending', at: '2026-11-03T11:00:00Z', unsent: true })]);
  });

  it('does not repeat what the server already has when the reply was lost', () => {
    const { entries, costs } = applyQueuedEntries([entry()], [cost()], [handover, expense]);
    expect(entries).toEqual([entry({ unsent: true })]);
    expect(costs).toEqual([cost({ unsent: true })]);
  });
});

describe('summariseDay', () => {
  it('works out the cash the driver should hold', () => {
    const summary = summariseDay(
      [entry(), entry({ id: 'e2', kind: 'remittance', amount: 30_000, status: 'pending' })],
      [cost()],
      'day-1',
    );
    expect(summary).toEqual({
      takings: 80_000,
      takingsWaiting: 0,
      handedOver: 30_000,
      handedOverWaiting: 30_000,
      costsFromCash: 20_000,
      cashInHand: 30_000,
    });
  });

  it('counts unchecked takings, and leaves out disputed entries', () => {
    const summary = summariseDay([entry({ status: 'pending' }), entry({ id: 'e2', amount: 5_000, status: 'disputed' })], [], 'day-1');
    expect(summary.takings).toBe(80_000);
    expect(summary.takingsWaiting).toBe(80_000);
    expect(summary.cashInHand).toBe(80_000);
  });

  it('does not subtract the reversal of a disputed entry, which was never counted', () => {
    const summary = summariseDay(
      [
        entry({ id: 'wrong', status: 'disputed' }),
        entry({ id: 'reversal', amount: -80_000, reversesId: 'wrong' }),
        entry({ id: 'right', amount: 70_000 }),
      ],
      [],
      'day-1',
    );
    expect(summary.takings).toBe(70_000);
    expect(summary.cashInHand).toBe(70_000);
  });

  it('nets out a correction, and ignores other days and costs not paid from the cash', () => {
    const summary = summariseDay(
      [entry(), entry({ id: 'reversal', amount: -80_000 }), entry({ id: 'other', tripDayId: 'day-2' })],
      [cost({ paidBy: 'owner' }), cost({ id: 'c2', tripDayId: 'day-2' })],
      'day-1',
    );
    expect(summary.takings).toBe(0);
    expect(summary.costsFromCash).toBe(0);
  });
});

const day = (over: Partial<DayView> = {}): DayView => ({
  id: 'day-1',
  vehicleId: 'bus-1',
  serviceDate: '2026-11-03',
  odometerStart: 1000,
  odometerEnd: null,
  startedAt: null,
  endedAt: null,
  startSentAt: null,
  endSentAt: null,
  unsent: false,
  ...over,
});

const start = {
  type: 'start_day',
  payload: { tripDayId: 'day-1', vehicleId: 'bus-1', serviceDate: '2026-11-03', odometerStart: 1000 },
};
const end = { type: 'end_day', payload: { tripDayId: 'day-1', odometerEnd: 1250 } };

describe('day times', () => {
  it('keeps the phone time of a day started and ended with no signal', () => {
    const [shown] = applyQueuedDayCommands(
      [],
      [
        { ...start, deviceTime: '2026-11-03T04:00:00Z' },
        { ...end, deviceTime: '2026-11-03T16:30:00Z' },
      ],
    );
    expect(shown).toMatchObject({ startedAt: '2026-11-03T04:00:00Z', endedAt: '2026-11-03T16:30:00Z', startSentAt: null });
  });

  it('flags an entry that reached the server over an hour from the phone time, in either direction', () => {
    expect(sentLongAfter('2026-11-03T04:00:00Z', '2026-11-03T06:30:00Z')).toBe(true);
    expect(sentLongAfter('2026-11-03T06:30:00Z', '2026-11-03T04:00:00Z')).toBe(true);
    expect(sentLongAfter('2026-11-03T04:00:00Z', '2026-11-03T04:30:00Z')).toBe(false);
    expect(sentLongAfter('2026-11-03T04:00:00Z', '2026-11-03T05:00:00Z')).toBe(false);
  });

  it('flags nothing while a time is missing', () => {
    expect(sentLongAfter(null, '2026-11-03T06:30:00Z')).toBe(false);
    expect(sentLongAfter('2026-11-03T04:00:00Z', null)).toBe(false);
  });
});

describe('applyQueuedDayCommands', () => {
  it('shows a day started with no signal', () => {
    expect(applyQueuedDayCommands([], [start])).toEqual([day({ unsent: true })]);
  });

  it('starts and ends a day that exists only on the phone', () => {
    expect(applyQueuedDayCommands([], [start, end])).toEqual([day({ odometerEnd: 1250, unsent: true })]);
  });

  it('does not show a day twice when the server has it but the reply was lost', () => {
    expect(applyQueuedDayCommands([day()], [start])).toEqual([day({ unsent: true })]);
  });

  it('ends a day the server already knows about', () => {
    expect(applyQueuedDayCommands([day()], [end])).toEqual([day({ odometerEnd: 1250, unsent: true })]);
  });

  it('ignores other commands and leaves its input alone', () => {
    const days = [day()];
    expect(applyQueuedDayCommands(days, [{ type: 'record_handover', payload: {} }])).toEqual([day()]);
    applyQueuedDayCommands(days, [end]);
    expect(days[0]!.odometerEnd).toBeNull();
  });
});

describe('currentDayForVehicle', () => {
  it('prefers the running day, even one started on an earlier date', () => {
    const running = day({ id: 'old', serviceDate: '2026-11-02' });
    const finished = day({ id: 'done', odometerEnd: 1100 });
    expect(currentDayForVehicle([finished, running], 'bus-1', '2026-11-03')?.id).toBe('old');
  });

  it('shows a day finished today, but not one finished earlier', () => {
    const today = day({ odometerEnd: 1100 });
    const earlier = day({ serviceDate: '2026-11-02', odometerEnd: 1100 });
    expect(currentDayForVehicle([today], 'bus-1', '2026-11-03')).toEqual(today);
    expect(currentDayForVehicle([earlier], 'bus-1', '2026-11-03')).toBeNull();
  });

  it('only looks at the given bus', () => {
    expect(currentDayForVehicle([day()], 'bus-2', '2026-11-03')).toBeNull();
  });
});
