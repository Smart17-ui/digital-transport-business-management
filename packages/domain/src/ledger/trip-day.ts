import type { Bearer, CostTerms } from '../arrangement/index.ts';
import { DomainError, invariant } from '../errors.ts';
import { sum, type Ngwee } from '../money.ts';
import type { ApprovalPolicy } from '../policies/approval.ts';
import type { VehicleStatus } from '../policies/vehicle-status.ts';
import {
  defaultBearer,
  expenseStateFrom,
  validateExpense,
  type Expense,
  type NewExpense,
} from './expense.ts';
import { validateHandover, type IncomeEntry, type NewHandover, type PaymentMethod } from './income-entry.ts';

/** The most an odometer can show: seven digits. */
const MAX_ODOMETER_KM = 9_999_999;

export type TripDayStatus = 'open' | 'closed';

export interface TripDayProps {
  id: string;
  businessId: string;
  vehicleId: string;
  driverId: string;
  /** The arrangement in force when the day started; settlement always uses it. */
  arrangementId: string;
  /** Business-local date, YYYY-MM-DD. */
  serviceDate: string;
  odometerStart: number;
  odometerEnd: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface StartDayInput {
  id: string;
  businessId: string;
  vehicleId: string;
  driverId: string;
  serviceDate: string;
  odometerStart: number;
  at: string;
}

export interface StartDayContext {
  openDayOnVehicle: boolean;
  vehicleStatus: VehicleStatus;
  /** The Driver's active arrangement on this vehicle, if any. */
  activeArrangementId: string | null;
}

/**
 * Aggregate root for one vehicle's working day. It creates the day's income
 * entries and expenses (Creator) and answers questions about them
 * (Information Expert). Validation here runs on the server for every command.
 */
export class TripDay {
  private constructor(
    private props: TripDayProps,
    private readonly incomeEntries: IncomeEntry[],
    private readonly expenseEntries: Expense[],
  ) {}

  static start(input: StartDayInput, ctx: StartDayContext): TripDay {
    invariant(!ctx.openDayOnVehicle, 'day.already_open');
    invariant(ctx.vehicleStatus !== 'off_road', 'day.vehicle_off_road');
    invariant(ctx.vehicleStatus !== 'retired', 'day.vehicle_retired');
    invariant(ctx.activeArrangementId !== null, 'day.no_active_arrangement');
    assertOdometer(input.odometerStart);
    invariant(/^\d{4}-\d{2}-\d{2}$/.test(input.serviceDate), 'day.invalid_date');
    return new TripDay(
      {
        id: input.id,
        businessId: input.businessId,
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        arrangementId: ctx.activeArrangementId,
        serviceDate: input.serviceDate,
        odometerStart: input.odometerStart,
        odometerEnd: null,
        startedAt: input.at,
        endedAt: null,
      },
      [],
      [],
    );
  }

  static restore(props: TripDayProps, income: IncomeEntry[] = [], expenses: Expense[] = []): TripDay {
    return new TripDay({ ...props }, [...income], [...expenses]);
  }

  get id(): string {
    return this.props.id;
  }
  get status(): TripDayStatus {
    return this.props.endedAt === null ? 'open' : 'closed';
  }
  get snapshot(): Readonly<TripDayProps> {
    return { ...this.props };
  }
  get income(): readonly IncomeEntry[] {
    return this.incomeEntries;
  }
  get expenses(): readonly Expense[] {
    return this.expenseEntries;
  }
  get distance(): number | null {
    return this.props.odometerEnd === null ? null : this.props.odometerEnd - this.props.odometerStart;
  }

  /** UC11 steps 5-6. Returns the distance driven. */
  end(odometerEnd: number, at: string): number {
    invariant(this.status === 'open', 'day.already_closed');
    assertOdometer(odometerEnd);
    invariant(odometerEnd >= this.props.odometerStart, 'day.end_reading_below_start');
    this.props = { ...this.props, odometerEnd, endedAt: at };
    return odometerEnd - this.props.odometerStart;
  }

  /** An Owner reopens a day ended by mistake. What it said is kept in day_reopenings. */
  reopen(reason: string): void {
    invariant(this.status === 'closed', 'day.not_closed');
    invariant(reason.trim().length > 0, 'day.reopen_reason_required');
    this.props = { ...this.props, odometerEnd: null, endedAt: null };
  }

  /** UC8 step 5: a new handover, pending confirmation by the other party. */
  recordHandover(input: NewHandover, allowedMethods: readonly PaymentMethod[]): IncomeEntry {
    validateHandover(input, allowedMethods);
    const entry: IncomeEntry = {
      ...input,
      tripDayId: this.props.id,
      source: 'app',
      late: this.status === 'closed',
      reversesId: null,
      replacesId: null,
      status: 'pending',
    };
    this.incomeEntries.push(entry);
    return entry;
  }

  /** UC12 and UC13: an expense on this day, approved or pending by policy. */
  recordExpense(
    input: NewExpense,
    costs: CostTerms,
    policy: ApprovalPolicy,
    actorIsOwner: boolean,
  ): Expense {
    const expense = buildExpense(input, this.props.id, this.status === 'closed', costs, policy, actorIsOwner);
    this.expenseEntries.push(expense);
    return expense;
  }

  /**
   * Confirmed entries that count towards the day. The reversal of a disputed
   * entry is left out: it marks the dispute as resolved, and has nothing to cancel.
   */
  private countedEntries(): IncomeEntry[] {
    const disputed = new Set(this.incomeEntries.filter((e) => e.status === 'disputed').map((e) => e.id));
    return this.incomeEntries.filter(
      (e) => e.status === 'confirmed' && (e.reversesId === null || !disputed.has(e.reversesId)),
    );
  }

  /** Signed sum of confirmed takings, including corrections. */
  confirmedIncome(): Ngwee {
    return sum(
      this.countedEntries()
        .filter((e) => e.kind === 'takings')
        .map((e) => e.amount),
    );
  }

  /** Cash confirmed as received by the Owner from this day (takings and remittances). */
  confirmedReceivedByOwner(): Ngwee {
    return sum(
      this.countedEntries()
        .filter((e) => e.receiver.kind === 'owner')
        .map((e) => e.amount),
    );
  }

  approvedExpensesBorneBy(bearer: Bearer): Ngwee {
    return sum(
      this.expenseEntries
        .filter((e) => e.borneBy === bearer && e.state.status === 'approved')
        .map((e) => e.state.approvedAmount ?? 0),
    );
  }

  /** Approved expenses paid with the Owner's money: directly or from an advance. */
  approvedExpensesFundedByOwner(): Ngwee {
    return sum(
      this.expenseEntries
        .filter((e) => e.paidBy !== 'driver_cash' && e.state.status === 'approved')
        .map((e) => e.state.approvedAmount ?? 0),
    );
  }

  /** Entries that keep the day provisional: not yet checked, or disputed and not yet corrected. */
  unconfirmedIncome(): IncomeEntry[] {
    const corrected = new Set(this.incomeEntries.map((e) => e.reversesId));
    return this.incomeEntries.filter((e) => e.status !== 'confirmed' && !corrected.has(e.id));
  }

  pendingExpenses(): Expense[] {
    return this.expenseEntries.filter((e) => e.state.status === 'pending');
  }
}

/**
 * Builds an expense. tripDayId is null only for an owner-paid cost outside any
 * day (servicing, road tax), which never enters a daily settlement (UC12 3a).
 */
export function buildExpense(
  input: NewExpense,
  tripDayId: string | null,
  late: boolean,
  costs: CostTerms,
  policy: ApprovalPolicy,
  actorIsOwner: boolean,
): Expense {
  validateExpense(input);
  if (tripDayId === null) {
    invariant(input.paidBy === 'owner', 'expense.needs_open_day');
  }
  if (input.borneByOverride !== null && !actorIsOwner) {
    throw new DomainError('expense.only_owner_sets_bearer');
  }
  const decision = policy.decide(input, costs);
  const pending = expenseStateFrom('pending', null, null);
  return {
    id: input.id,
    tripDayId,
    vehicleId: input.vehicleId,
    category: input.category,
    kind: input.kind,
    amount: input.amount,
    litres: input.litres,
    paidBy: input.paidBy,
    borneBy: input.borneByOverride ?? defaultBearer(input.kind, costs),
    note: input.note.trim(),
    receiptPath: input.receiptPath,
    recordedBy: input.recordedBy,
    late,
    reversesId: null,
    replacesId: null,
    state: decision === 'approved' ? pending.approve(input.amount, input.amount) : pending,
  };
}

function assertOdometer(reading: number): void {
  invariant(Number.isInteger(reading) && reading >= 0 && reading <= MAX_ODOMETER_KM, 'day.invalid_odometer');
}
