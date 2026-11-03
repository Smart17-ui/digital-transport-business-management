import type { CommandPayload } from '../commands.ts';

/** A working day as the phone shows it: what the server has, plus what is queued to send. */
export interface DayView {
  id: string;
  vehicleId: string;
  serviceDate: string;
  odometerStart: number;
  odometerEnd: number | null;
  /** True while part of this day exists only on the phone. */
  unsent: boolean;
}

export interface QueuedDayCommand {
  type: string;
  payload: unknown;
  /** When the user made the entry, by the phone's clock. */
  deviceTime?: string;
}

export interface DayEntry {
  id: string;
  tripDayId: string;
  kind: 'takings' | 'remittance';
  /** Negative only on a reversing entry created by a correction. */
  amount: number;
  status: 'pending' | 'confirmed' | 'disputed';
  /** Why the entry was disputed. */
  reason: string | null;
  /** The entry this one cancels, when it is the reversal half of a correction. */
  reversesId: string | null;
  at: string;
  unsent: boolean;
}

export interface DayCost {
  id: string;
  tripDayId: string;
  category: string;
  /** The cost this one cancels, when it is the reversal half of a correction. */
  reversesId: string | null;
  /** Negative only on a reversing entry created by a correction. */
  amount: number;
  litres: number | null;
  paidBy: 'driver_cash' | 'advance' | 'owner';
  note: string;
  at: string;
  unsent: boolean;
}

export interface DaySummary {
  /** Fares recorded, counting those the Owner has not checked yet. */
  takings: number;
  /** Of those, the part still waiting for the Owner. */
  takingsWaiting: number;
  handedOver: number;
  handedOverWaiting: number;
  costsFromCash: number;
  /** What the Driver should be holding now. A disputed entry is left out until it is corrected. */
  cashInHand: number;
}

/** Adds entries and costs that are still queued, without repeating any the server already has. */
export function applyQueuedEntries(
  entries: readonly DayEntry[],
  costs: readonly DayCost[],
  queued: readonly QueuedDayCommand[],
): { entries: DayEntry[]; costs: DayCost[] } {
  const nextEntries = entries.map((entry) => ({ ...entry }));
  const nextCosts = costs.map((cost) => ({ ...cost }));
  for (const command of queued) {
    const at = command.deviceTime ?? '';
    if (command.type === 'record_handover') {
      const p = command.payload as CommandPayload<'record_handover'>;
      const known = nextEntries.find((entry) => entry.id === p.entryId);
      if (known) {
        known.unsent = true;
      } else {
        nextEntries.push({
          id: p.entryId,
          tripDayId: p.tripDayId,
          kind: p.kind,
          amount: p.amount,
          status: 'pending',
          reason: null,
          reversesId: null,
          at,
          unsent: true,
        });
      }
    } else if (command.type === 'log_expense') {
      const p = command.payload as CommandPayload<'log_expense'>;
      const known = nextCosts.find((cost) => cost.id === p.expenseId);
      if (known) {
        known.unsent = true;
      } else if (p.tripDayId !== null) {
        nextCosts.push({
          id: p.expenseId,
          tripDayId: p.tripDayId,
          category: p.category,
          reversesId: null,
          amount: p.amount,
          litres: p.litres,
          paidBy: p.paidBy,
          note: p.note,
          at,
          unsent: true,
        });
      }
    }
  }
  return { entries: nextEntries, costs: nextCosts };
}

/** A running count for the screen. The settlement on the server remains the figure that counts. */
export function summariseDay(entries: readonly DayEntry[], costs: readonly DayCost[], tripDayId: string): DaySummary {
  const disputed = new Set(entries.filter((entry) => entry.status === 'disputed').map((entry) => entry.id));
  const counted = entries.filter(
    (entry) =>
      entry.tripDayId === tripDayId &&
      entry.status !== 'disputed' &&
      (entry.reversesId === null || !disputed.has(entry.reversesId)),
  );
  const total = (kind: DayEntry['kind'], waitingOnly = false) =>
    counted
      .filter((entry) => entry.kind === kind && (!waitingOnly || entry.status === 'pending'))
      .reduce((sum, entry) => sum + entry.amount, 0);
  const takings = total('takings');
  const handedOver = total('remittance');
  const costsFromCash = costs
    .filter((cost) => cost.tripDayId === tripDayId && cost.paidBy === 'driver_cash')
    .reduce((sum, cost) => sum + cost.amount, 0);
  return {
    takings,
    takingsWaiting: total('takings', true),
    handedOver,
    handedOverWaiting: total('remittance', true),
    costsFromCash,
    cashInHand: takings - costsFromCash - handedOver,
  };
}

/**
 * Applies queued commands in order on top of what the server returned. A command
 * the server already applied, whose reply was lost, changes nothing but the flag.
 */
export function applyQueuedDayCommands(days: readonly DayView[], queued: readonly QueuedDayCommand[]): DayView[] {
  const result = days.map((day) => ({ ...day }));
  for (const command of queued) {
    if (command.type === 'start_day') {
      const p = command.payload as CommandPayload<'start_day'>;
      const known = result.find((day) => day.id === p.tripDayId);
      if (known) {
        known.unsent = true;
      } else {
        result.push({
          id: p.tripDayId,
          vehicleId: p.vehicleId,
          serviceDate: p.serviceDate,
          odometerStart: p.odometerStart,
          odometerEnd: null,
          unsent: true,
        });
      }
    } else if (command.type === 'end_day') {
      const p = command.payload as CommandPayload<'end_day'>;
      const day = result.find((d) => d.id === p.tripDayId);
      if (day) {
        day.odometerEnd = p.odometerEnd;
        day.unsent = true;
      }
    }
  }
  return result;
}

/** The most recent finished day for a bus, so its settlement stays within reach after the date moves on. */
export function lastFinishedDayForVehicle(days: readonly DayView[], vehicleId: string): DayView | null {
  return (
    days
      .filter((day) => day.vehicleId === vehicleId && day.odometerEnd !== null)
      .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate))[0] ?? null
  );
}

/** The day to show for a bus: the one running, otherwise one finished today. */
export function currentDayForVehicle(days: readonly DayView[], vehicleId: string, today: string): DayView | null {
  const mine = days.filter((day) => day.vehicleId === vehicleId);
  return (
    mine.find((day) => day.odometerEnd === null) ?? mine.find((day) => day.serviceDate === today) ?? null
  );
}
