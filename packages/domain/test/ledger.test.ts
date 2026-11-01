import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canConfirm,
  correctExpense,
  correctIncome,
  FloatApprovalPolicy,
  PendingState,
  TripDay,
  VehicleStatusPolicy,
} from '../src/index.ts';
import { conductor, driver, DRIVER, expense, openDay, OWNER, ownerBearsFuel } from './fixtures.ts';

describe('TripDay', () => {
  const start = (ctx: Partial<Parameters<typeof TripDay.start>[1]>) => () =>
    TripDay.start(
      {
        id: randomUUID(),
        businessId: randomUUID(),
        vehicleId: randomUUID(),
        driverId: DRIVER,
        serviceDate: '2026-11-02',
        odometerStart: 100,
        at: '2026-11-02T05:00:00Z',
      },
      { openDayOnVehicle: false, vehicleStatus: 'active', activeArrangementId: randomUUID(), ...ctx },
    );

  it('blocks Start day when a day is open, the vehicle is off-road, or there is no arrangement', () => {
    expect(start({ openDayOnVehicle: true })).toThrow('day.already_open');
    expect(start({ vehicleStatus: 'off_road' })).toThrow('day.vehicle_off_road');
    expect(start({ activeArrangementId: null })).toThrow('day.no_active_arrangement');
  });

  it('rejects an end reading below the start and computes distance', () => {
    const day = openDay();
    expect(() => day.end(9_999, '2026-11-02T18:00:00Z')).toThrow('day.end_reading_below_start');
    expect(day.end(10_180, '2026-11-02T18:00:00Z')).toBe(180);
    expect(day.status).toBe('closed');
    expect(() => day.end(10_200, '2026-11-02T19:00:00Z')).toThrow('day.already_closed');
  });

  it('rejects zero or negative handovers whatever the app sends', () => {
    const day = openDay();
    const handover = (amount: number) => () =>
      day.recordHandover(
        { id: randomUUID(), kind: 'takings', amount, method: 'cash', giver: conductor, receiver: driver, recordedBy: DRIVER },
        ['cash'],
      );
    expect(handover(0)).toThrow('handover.amount_not_positive');
    expect(handover(-500)).toThrow('handover.amount_not_positive');
    expect(handover(10.5)).toThrow('money.not_integer');
  });

  it('only accepts payment methods available in the stage', () => {
    const day = openDay();
    expect(() =>
      day.recordHandover(
        { id: randomUUID(), kind: 'takings', amount: 100, method: 'mobile_money', giver: conductor, receiver: driver, recordedBy: DRIVER },
        ['cash'],
      ),
    ).toThrow('handover.method_not_available');
  });

  it('flags entries that arrive after the day closed as late', () => {
    const day = openDay();
    day.end(10_100, '2026-11-02T18:00:00Z');
    const entry = day.recordHandover(
      { id: randomUUID(), kind: 'takings', amount: 100, method: 'cash', giver: conductor, receiver: driver, recordedBy: DRIVER },
      ['cash'],
    );
    expect(entry.late).toBe(true);
  });

  it('lets the other party or the Owner confirm, never the recorder', () => {
    const day = openDay();
    const entry = day.recordHandover(
      { id: randomUUID(), kind: 'takings', amount: 100, method: 'cash', giver: conductor, receiver: driver, recordedBy: DRIVER },
      ['cash'],
    );
    expect(canConfirm(entry, DRIVER, OWNER)).toBe(false);
    expect(canConfirm(entry, OWNER, OWNER)).toBe(true);
    expect(canConfirm(entry, randomUUID(), OWNER)).toBe(false);
  });
});

describe('expenses', () => {
  it('takes the bearer from the arrangement and approves everything in Version 0', () => {
    const day = openDay();
    const fuel = expense(day, 20_000, 'driver_cash');
    expect(fuel.borneBy).toBe('owner');
    expect(fuel.state.status).toBe('approved');
    expect(fuel.state.approvedAmount).toBe(20_000);
  });

  it('only lets the Owner override the bearer', () => {
    const day = openDay();
    const input = {
      id: randomUUID(), vehicleId: randomUUID(), category: 'fine', kind: 'roadside' as const, amount: 5_000,
      litres: null, paidBy: 'driver_cash' as const, note: '', receiptPath: null, recordedBy: DRIVER,
      borneByOverride: 'driver' as const,
    };
    expect(() => day.recordExpense(input, ownerBearsFuel, new FloatApprovalPolicy(), false)).toThrow(
      'expense.only_owner_sets_bearer',
    );
    expect(day.recordExpense(input, ownerBearsFuel, new FloatApprovalPolicy(), true).borneBy).toBe('driver');
  });

  it('Version 1 float: fuel above the float waits for approval', () => {
    const policy = new FloatApprovalPolicy();
    const costs = { ...ownerBearsFuel, fuelFloat: 30_000 };
    expect(policy.decide({ kind: 'fuel', amount: 30_000, paidBy: 'driver_cash' }, costs)).toBe('approved');
    expect(policy.decide({ kind: 'fuel', amount: 30_001, paidBy: 'driver_cash' }, costs)).toBe('pending');
    expect(policy.decide({ kind: 'fuel', amount: 90_000, paidBy: 'owner' }, costs)).toBe('approved');
  });

  it('State: a decided expense cannot be decided again', () => {
    const declined = new PendingState().decline('no receipt');
    expect(() => declined.approve(100, 100)).toThrow('expense.already_decided');
    expect(() => new PendingState().approve(200, 100)).toThrow('expense.invalid_approved_amount');
    expect(() => new PendingState().decline('  ')).toThrow('expense.decline_reason_required');
  });
});

describe('corrections', () => {
  it('reverses and replaces a confirmed entry, leaving the original untouched', () => {
    const day = openDay();
    const original = day.recordHandover(
      { id: randomUUID(), kind: 'takings', amount: 50_000, method: 'cash', giver: conductor, receiver: driver, recordedBy: DRIVER },
      ['cash'],
    );
    expect(() =>
      correctIncome(original, { reversalId: randomUUID(), replacementId: randomUUID(), amount: 45_000, reason: 'miscount', actorId: OWNER }, false),
    ).toThrow('correction.entry_not_locked');

    original.status = 'confirmed';
    const { reversal, replacement } = correctIncome(
      original,
      { reversalId: randomUUID(), replacementId: randomUUID(), amount: 45_000, reason: 'miscount', actorId: OWNER },
      false,
    );
    expect(original.amount).toBe(50_000);
    expect(reversal.amount).toBe(-50_000);
    expect(reversal.reversesId).toBe(original.id);
    expect(replacement?.amount).toBe(45_000);
    expect(replacement?.replacesId).toBe(original.id);
  });

  it('refuses a correction with no reason or a second correction', () => {
    const fuel = expense(openDay(), 20_000, 'driver_cash');
    const request = { reversalId: randomUUID(), replacementId: randomUUID(), amount: 0, actorId: OWNER, borneBy: 'driver' as const };
    expect(() => correctExpense(fuel, { ...request, reason: ' ' }, false)).toThrow('correction.reason_required');
    expect(() => correctExpense(fuel, { ...request, reason: 'duplicate' }, true)).toThrow('correction.already_corrected');
    const { reversal, replacement } = correctExpense(fuel, { ...request, reason: 'duplicate' }, false);
    expect(reversal.state.approvedAmount).toBe(-20_000);
    expect(replacement).toBeNull();
  });
});

describe('VehicleStatusPolicy', () => {
  const policy = new VehicleStatusPolicy([
    { status: 'off_road', at: '2026-11-03T08:00:00Z' },
    { status: 'active', at: '2026-11-05T15:00:00Z' },
  ]);

  it('removes the target on any day the vehicle was off-road, resuming the next day', () => {
    expect(policy.targetApplies('2026-11-02')).toBe(true);
    expect(policy.targetApplies('2026-11-03')).toBe(false);
    expect(policy.targetApplies('2026-11-04')).toBe(false);
    expect(policy.targetApplies('2026-11-05')).toBe(false); // back in service at 17:00 local
    expect(policy.targetApplies('2026-11-06')).toBe(true);
  });

  it('uses Zambian local dates', () => {
    // 23:30 UTC on the 2nd is 01:30 on the 3rd in Lusaka.
    const late = new VehicleStatusPolicy([{ status: 'off_road', at: '2026-11-02T23:30:00Z' }]);
    expect(late.targetApplies('2026-11-02')).toBe(true);
    expect(late.targetApplies('2026-11-03')).toBe(false);
  });
});
