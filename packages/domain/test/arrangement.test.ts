import { describe, expect, it } from 'vitest';
import { ArrangementFactory, type SplitInput } from '../src/index.ts';

const all = [
  ArrangementFactory.create('fixed_target', { dailyTarget: 50_000 }),
  ArrangementFactory.create('revenue_share', { ownerShareBasisPoints: 6_000 }),
  ArrangementFactory.create('salary', { dailyPay: 15_000 }),
  ArrangementFactory.create('rent_to_own', { dailyPayment: 40_000, totalPrice: 20_000_000 }),
];

const inputs: SplitInput[] = [
  { grossIncome: 80_000, ownerBorneExpenses: 10_000, driverBorneExpenses: 2_000, targetApplies: true },
  { grossIncome: 30_000, ownerBorneExpenses: 0, driverBorneExpenses: 5_000, targetApplies: true },
  { grossIncome: 0, ownerBorneExpenses: 0, driverBorneExpenses: 0, targetApplies: false },
  { grossIncome: 12_345, ownerBorneExpenses: 999, driverBorneExpenses: 1, targetApplies: false },
];

describe('arrangements', () => {
  it.each(all.map((a) => [a.type, a] as const))('%s: parts add up to the day after expenses (Liskov)', (_, a) => {
    for (const input of inputs) {
      const { ownerShare, driverShare } = a.split(input);
      expect(ownerShare + driverShare).toBe(
        input.grossIncome - input.ownerBorneExpenses - input.driverBorneExpenses,
      );
    }
  });

  it('fixed target: Driver keeps the surplus; a shortfall leaves the Driver negative', () => {
    const a = all[0]!;
    expect(a.split({ grossIncome: 80_000, ownerBorneExpenses: 0, driverBorneExpenses: 0, targetApplies: true }))
      .toEqual({ ownerShare: 50_000, driverShare: 30_000 });
    expect(a.split({ grossIncome: 30_000, ownerBorneExpenses: 0, driverBorneExpenses: 0, targetApplies: true }))
      .toEqual({ ownerShare: 50_000, driverShare: -20_000 });
  });

  it('no target applies on an off-road day', () => {
    const a = all[0]!;
    expect(a.split({ grossIncome: 0, ownerBorneExpenses: 0, driverBorneExpenses: 0, targetApplies: false }))
      .toEqual({ ownerShare: 0, driverShare: 0 });
  });

  it('salary: all income to the Owner, Driver owed the pay', () => {
    expect(all[2]!.split({ grossIncome: 80_000, ownerBorneExpenses: 0, driverBorneExpenses: 0, targetApplies: true }))
      .toEqual({ ownerShare: 65_000, driverShare: 15_000 });
  });

  it('rejects bad or unknown terms', () => {
    expect(() => ArrangementFactory.create('fixed_target', { dailyTarget: -1 })).toThrow('arrangement.invalid_terms');
    expect(() => ArrangementFactory.create('fixed_target', { dailyTarget: 1.5 })).toThrow();
    expect(() => ArrangementFactory.create('revenue_share', { ownerShareBasisPoints: 12_000 })).toThrow();
    expect(() => ArrangementFactory.create('lease', {})).toThrow('arrangement.unknown_type');
  });
});
