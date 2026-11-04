import { describe, expect, it } from 'vitest';
import { estimateSettlement, type DayCost, type DayEntry, type DayView, type EstimateInput } from '../src/index.ts';

const day: DayView = {
  id: 'day-1',
  vehicleId: 'bus-1',
  serviceDate: '2026-11-03',
  odometerStart: 1000,
  odometerEnd: null,
  unsent: false,
};

const entry = (over: Partial<DayEntry> = {}): DayEntry => ({
  id: 'e1',
  tripDayId: 'day-1',
  kind: 'takings',
  amount: 80_000,
  status: 'pending',
  reason: null,
  reversesId: null,
  at: '',
  unsent: false,
  ...over,
});

const fuel = (over: Partial<DayCost> = {}): DayCost => ({
  id: 'c1',
  tripDayId: 'day-1',
  category: 'fuel',
  reversesId: null,
  amount: 20_000,
  litres: null,
  paidBy: 'driver_cash',
  note: '',
  at: '',
  unsent: true,
  ...over,
});

const input = (over: Partial<EstimateInput> = {}): EstimateInput => ({
  day,
  entries: [entry()],
  costs: [fuel()],
  arrangement: { type: 'fixed_target', terms: { dailyTarget: 50_000 }, fuelBearer: 'owner', otherCostsBearer: 'owner' },
  arrearsBroughtForward: 0,
  ...over,
});

describe('estimateSettlement', () => {
  it('gives the same answer as the server test for target K500, takings K800, owner-borne fuel K200', () => {
    const estimate = estimateSettlement(input());
    expect(estimate.ownerShare).toBe(30_000);
    expect(estimate.whoOwesWhom).toBe('driver_owes_owner');
    expect(estimate.amountOwed).toBe(30_000);
  });

  it('counts entries still waiting for the owner, and cash already handed over', () => {
    const estimate = estimateSettlement(
      input({ entries: [entry(), entry({ id: 'e2', kind: 'remittance', amount: 30_000 })] }),
    );
    expect(estimate.amountOwed).toBe(0);
    expect(estimate.whoOwesWhom).toBe('nobody');
  });

  it('leaves out a disputed entry', () => {
    const estimate = estimateSettlement(
      input({ entries: [entry(), entry({ id: 'e2', amount: 10_000, status: 'disputed' })] }),
    );
    expect(estimate.grossIncome).toBe(80_000);
  });

  it('works out who bears a cost not sent yet from the agreement, and respects what the server said', () => {
    const arrangement: EstimateInput['arrangement'] = {
      type: 'revenue_share',
      terms: { ownerShareBasisPoints: 5000 },
      fuelBearer: 'driver',
      otherCostsBearer: 'owner',
    };
    expect(estimateSettlement(input({ arrangement })).expensesBorneByDriver).toBe(20_000);
    expect(estimateSettlement(input({ arrangement, costs: [fuel({ borneBy: 'owner' })] })).expensesBorneByOwner).toBe(20_000);
  });

  it('adds money owed from earlier days', () => {
    expect(estimateSettlement(input({ arrearsBroughtForward: 5_000 })).amountOwed).toBe(35_000);
  });

  it('ignores entries and costs from other days', () => {
    const estimate = estimateSettlement(
      input({ entries: [entry({ tripDayId: 'other' })], costs: [fuel({ tripDayId: 'other' })] }),
    );
    expect(estimate.grossIncome).toBe(0);
    expect(estimate.expensesBorneByOwner).toBe(0);
  });
});
