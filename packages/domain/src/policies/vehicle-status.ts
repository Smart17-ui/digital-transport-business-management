export type VehicleStatus = 'active' | 'off_road' | 'retired';

export interface StatusChange {
  status: VehicleStatus;
  /** ISO timestamp of the change. */
  at: string;
}

/** Zambia is on Central Africa Time, UTC+2, with no daylight saving. */
export const BUSINESS_UTC_OFFSET_MINUTES = 120;

/** The business-local calendar date (YYYY-MM-DD) of an instant. */
export function localDate(isoTimestamp: string, offsetMinutes = BUSINESS_UTC_OFFSET_MINUTES): string {
  const ms = Date.parse(isoTimestamp) + offsetMinutes * 60_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Downtime rule (UC7): no daily target applies on a date when the vehicle was
 * off-road at any moment, so setting it active again resumes the target the
 * next day. A vehicle with no history is active.
 */
export class VehicleStatusPolicy {
  constructor(private readonly history: readonly StatusChange[]) {}

  statusAtStartOf(date: string): VehicleStatus {
    let status: VehicleStatus = 'active';
    for (const change of this.sorted()) {
      if (localDate(change.at) >= date) break;
      status = change.status;
    }
    return status;
  }

  targetApplies(date: string): boolean {
    if (this.statusAtStartOf(date) === 'off_road') return false;
    return !this.sorted().some((c) => localDate(c.at) === date && c.status === 'off_road');
  }

  currentStatus(): VehicleStatus {
    return this.sorted().at(-1)?.status ?? 'active';
  }

  private sorted(): StatusChange[] {
    return [...this.history].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }
}
