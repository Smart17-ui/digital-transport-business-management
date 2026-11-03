import { describe, expect, it } from 'vitest';
import { allocatePayments, type DayBalance } from '../src/index.ts';

const day = (id: string, owedForDay: number, paid = 0): DayBalance => ({ id, owedForDay, paid });

describe('allocatePayments', () => {
  it('leaves each day as it is when nothing has been paid', () => {
    expect(allocatePayments([day('a', 500), day('b', 300)])).toEqual({ left: { a: 500, b: 300 }, balance: 800 });
  });

  it('applies a later payment to the oldest debt first', () => {
    const { left, balance } = allocatePayments([day('a', 500), day('b', 300, 600)]);
    expect(left).toEqual({ a: 0, b: 200 });
    expect(balance).toBe(200);
  });

  it('applies an early overpayment to a later debt', () => {
    const { left, balance } = allocatePayments([day('a', 100, 300), day('b', 300)]);
    expect(left).toEqual({ a: 0, b: 100 });
    expect(balance).toBe(100);
  });

  it('lets a day that left the owner owing pay off the driver’s older debt', () => {
    const { left, balance } = allocatePayments([day('a', 500), day('b', -200)]);
    expect(left).toEqual({ a: 300, b: 0 });
    expect(balance).toBe(300);
  });

  it('shows what the owner still owes on the days that created it', () => {
    const { left, balance } = allocatePayments([day('a', 100), day('b', -300)]);
    expect(left).toEqual({ a: 0, b: -200 });
    expect(balance).toBe(-200);
  });

  it('does not treat money the owner paid the driver as paying the driver’s debt', () => {
    const { left, balance } = allocatePayments([day('a', -300, -300), day('b', 200)]);
    expect(left).toEqual({ a: 0, b: 200 });
    expect(balance).toBe(200);
  });

  it('always adds up to the true balance when no payment overshoots', () => {
    const days = [day('a', 500, 100), day('b', -200), day('c', 300, 250), day('d', 0), day('e', 700)];
    const { left, balance } = allocatePayments(days);
    expect(Object.values(left).reduce((total, amount) => total + amount, 0)).toBe(balance);
    expect(balance).toBe(950);
  });

  it('handles no days at all', () => {
    expect(allocatePayments([])).toEqual({ left: {}, balance: 0 });
  });
});
