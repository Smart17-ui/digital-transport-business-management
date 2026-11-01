import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ArrangementFactory,
  arrearsFrom,
  calculateSettlement,
  paymentPosition,
  validatePaymentClaim,
  validatePaymentConfirmation,
  type SettlementPayment,
} from '../src/index.ts';
import { confirmed, expense, openDay } from './fixtures.ts';

const target = ArrangementFactory.create('fixed_target', { dailyTarget: 50_000 });
const noArrears = { targetApplies: true, arrearsBroughtForward: 0 };

describe('calculateSettlement', () => {
  it('fixed target: Driver holds the takings and owes the target, less owner-borne fuel paid from cash', () => {
    const day = openDay();
    confirmed(day, 'takings', 80_000);
    expense(day, 20_000, 'driver_cash'); // Owner bears fuel (UC13 5b)
    day.end(10_150, '2026-11-02T18:00:00Z');

    const s = calculateSettlement(day, target, noArrears);
    expect(s.grossIncome).toBe(80_000);
    expect(s.ownerShare).toBe(30_000); // target less the fuel the Owner bears
    expect(s.driverShare).toBe(30_000);
    expect(s.owedForDay).toBe(30_000);
    expect(s.whoOwesWhom).toBe('driver_owes_owner');
    expect(s.provisional).toBe(false);
  });

  it('counts remittances already handed to the Owner during the day', () => {
    const day = openDay();
    confirmed(day, 'takings', 80_000);
    confirmed(day, 'remittance', 40_000);
    day.end(10_150, '2026-11-02T18:00:00Z');
    const s = calculateSettlement(day, target, noArrears);
    expect(s.ownerNetCash).toBe(40_000);
    expect(s.amountOwed).toBe(10_000);
  });

  it('a shortfall below the target plus earlier arrears is what the Driver owes', () => {
    const day = openDay();
    confirmed(day, 'takings', 30_000);
    day.end(10_150, '2026-11-02T18:00:00Z');
    const s = calculateSettlement(day, target, { targetApplies: true, arrearsBroughtForward: 5_000 });
    expect(s.owedForDay).toBe(50_000);
    expect(s.netBalance).toBe(55_000);
    expect(s.driverShare).toBe(-20_000);
  });

  it('Owner owes the Driver when the Owner holds more than their share', () => {
    const day = openDay();
    confirmed(day, 'takings', 60_000);
    confirmed(day, 'remittance', 60_000);
    day.end(10_150, '2026-11-02T18:00:00Z');
    const salary = ArrangementFactory.create('salary', { dailyPay: 15_000 });
    const s = calculateSettlement(day, salary, noArrears);
    expect(s.whoOwesWhom).toBe('owner_owes_driver');
    expect(s.amountOwed).toBe(15_000);
  });

  it('fuel the Owner paid directly does not change what the Driver owes', () => {
    const withOwnerFuel = openDay();
    confirmed(withOwnerFuel, 'takings', 80_000);
    expense(withOwnerFuel, 20_000, 'owner');
    const without = openDay();
    confirmed(without, 'takings', 80_000);
    expect(calculateSettlement(withOwnerFuel, target, noArrears).owedForDay).toBe(
      calculateSettlement(without, target, noArrears).owedForDay,
    );
  });

  it('an off-road day carries no target and no arrears', () => {
    const day = openDay();
    day.end(10_000, '2026-11-02T18:00:00Z');
    const s = calculateSettlement(day, target, { targetApplies: false, arrearsBroughtForward: 0 });
    expect(s.owedForDay).toBe(0);
    expect(s.whoOwesWhom).toBe('nobody');
  });

  it('is provisional while the day is open or an entry is unconfirmed, which is excluded', () => {
    const day = openDay();
    confirmed(day, 'takings', 80_000);
    const pending = day.recordHandover(
      {
        id: randomUUID(), kind: 'takings', amount: 10_000, method: 'cash',
        giver: { kind: 'conductor', userId: null }, receiver: { kind: 'driver', userId: null }, recordedBy: randomUUID(),
      },
      ['cash'],
    );
    expect(calculateSettlement(day, target, noArrears).provisional).toBe(true);
    day.end(10_150, '2026-11-02T18:00:00Z');
    const s = calculateSettlement(day, target, noArrears);
    expect(s.provisional).toBe(true);
    expect(s.grossIncome).toBe(80_000);
    expect(s.unconfirmedIncomeIds).toEqual([pending.id]);
  });
});

describe('payments and arrears', () => {
  const payment = (amount: number, status: SettlementPayment['status'], confirmedAmount: number | null): SettlementPayment => ({
    id: randomUUID(), tripDayId: randomUUID(), payer: 'driver', amount, method: 'cash', status, confirmedAmount,
  });

  it('settles when the confirmed amount equals the balance', () => {
    expect(paymentPosition(30_000, [payment(30_000, 'confirmed', 30_000)])).toEqual({
      paid: 30_000, remaining: 0, state: 'settled',
    });
  });

  it('a lower confirmed amount is a part payment and the rest carries forward (UC17 4a)', () => {
    const position = paymentPosition(30_000, [payment(30_000, 'confirmed', 25_000)]);
    expect(position).toEqual({ paid: 25_000, remaining: 5_000, state: 'part_paid' });
    expect(arrearsFrom([{ owedForDay: 30_000, paid: 25_000 }])).toBe(5_000);
  });

  it('a claim awaiting confirmation changes nothing yet', () => {
    expect(paymentPosition(30_000, [payment(30_000, 'claimed', null)]).state).toBe('claimed');
  });

  it('only the owing side can claim, and not more than owed', () => {
    expect(() => validatePaymentClaim(30_000, 'owner', 1_000)).toThrow('payment.wrong_payer');
    expect(() => validatePaymentClaim(30_000, 'driver', 30_001)).toThrow('payment.more_than_owed');
    expect(() => validatePaymentClaim(0, 'driver', 1)).toThrow('payment.nothing_owed');
    expect(() => validatePaymentConfirmation(payment(100, 'claimed', null), 101)).toThrow(
      'payment.confirmed_more_than_claimed',
    );
  });
});
