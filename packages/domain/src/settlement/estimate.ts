import { ArrangementFactory, type ArrangementType, type Bearer } from '../arrangement/index.ts';
import { defaultBearer, expenseStateFrom, type Expense, type ExpenseKind } from '../ledger/expense.ts';
import type { DayCost, DayEntry, DayView } from '../ledger/day-view.ts';
import type { IncomeEntry } from '../ledger/income-entry.ts';
import { TripDay } from '../ledger/trip-day.ts';
import { calculateSettlement, type SettlementStatement } from './settlement.ts';

export interface EstimateInput {
  day: DayView;
  entries: readonly DayEntry[];
  costs: readonly DayCost[];
  arrangement: {
    type: ArrangementType;
    terms: unknown;
    fuelBearer: Bearer;
    otherCostsBearer: Bearer;
  };
  /** Positive: the Driver owes the Owner from earlier days, as last read from the server. */
  arrearsBroughtForward: number;
}

/**
 * What the settlement would be if every entry still waiting were confirmed as
 * recorded, for a driver with no signal. It runs the server's own calculation, so
 * the two only differ where the phone cannot know something: entries the Owner
 * later disputes, and a bus marked off the road that the phone has not heard about.
 */
export function estimateSettlement(input: EstimateInput): SettlementStatement {
  const { day, arrangement } = input;
  const costTerms = {
    fuelBearer: arrangement.fuelBearer,
    otherCostsBearer: arrangement.otherCostsBearer,
    fuelFloat: null,
  };

  const income = input.entries
    .filter((entry) => entry.tripDayId === day.id)
    .map(
      (entry): IncomeEntry => ({
        id: entry.id,
        tripDayId: day.id,
        kind: entry.kind,
        amount: entry.amount,
        method: 'cash',
        giver: { kind: entry.kind === 'takings' ? 'conductor' : 'driver', userId: null },
        receiver: { kind: entry.kind === 'takings' ? 'driver' : 'owner', userId: null },
        recordedBy: '',
        source: 'app',
        late: false,
        reversesId: entry.reversesId,
        replacesId: null,
        status: entry.status === 'disputed' ? 'disputed' : 'confirmed',
      }),
    );

  const expenses = input.costs
    .filter((cost) => cost.tripDayId === day.id)
    .map((cost): Expense => {
      const kind: ExpenseKind = cost.category === 'fuel' ? 'fuel' : 'roadside';
      return {
        id: cost.id,
        tripDayId: day.id,
        vehicleId: day.vehicleId,
        category: cost.category,
        kind,
        amount: cost.amount,
        litres: cost.litres,
        paidBy: cost.paidBy,
        borneBy: cost.borneBy ?? defaultBearer(kind, costTerms),
        note: cost.note,
        receiptPath: null,
        recordedBy: '',
        late: false,
        reversesId: cost.reversesId,
        replacesId: null,
        state: expenseStateFrom('approved', cost.amount, null),
      };
    });

  const tripDay = TripDay.restore(
    {
      id: day.id,
      businessId: '',
      vehicleId: day.vehicleId,
      driverId: '',
      arrangementId: '',
      serviceDate: day.serviceDate,
      odometerStart: day.odometerStart,
      odometerEnd: day.odometerEnd,
      startedAt: '',
      endedAt: day.odometerEnd === null ? null : day.serviceDate,
    },
    income,
    expenses,
  );
  return calculateSettlement(tripDay, ArrangementFactory.create(arrangement.type, arrangement.terms), {
    targetApplies: true,
    arrearsBroughtForward: input.arrearsBroughtForward,
  });
}
