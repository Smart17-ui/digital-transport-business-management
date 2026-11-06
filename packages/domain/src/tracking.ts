import { DomainError } from './errors.ts';
import { v } from './validate.ts';

export const MAX_POSITIONS_PER_UPLOAD = 200;

/** Worse than this, a point could be on the wrong road, so it does more harm than good. */
const WORST_ACCURACY_M = 50;
/** No bus goes this fast: two points this far apart mean one of them is wrong. */
const FASTEST_KMH = 160;
const EARTH_RADIUS_M = 6_371_000;
/** A bus below this is parked or crawling. Phones report a little speed even when still. */
const MOVING_KMH = 5;
/** Phones send about once a minute, so this long with nothing means something is wrong. */
const LATE_AFTER_MINUTES = 5;

export interface PositionPoint {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  heading: number | null;
  accuracyM: number | null;
  recordedAt: string;
}

export interface PositionUpload {
  tripDayId: string;
  deviceId: string;
  points: PositionPoint[];
}

export function isUsablePoint(point: PositionPoint): boolean {
  return (
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180 &&
    // 0,0 is in the ocean: it is what a phone reports before it has a fix.
    !(point.latitude === 0 && point.longitude === 0) &&
    (point.accuracyM === null || point.accuracyM <= WORST_ACCURACY_M)
  );
}

export function distanceMetres(a: PositionPoint, b: PositionPoint): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Whether to keep a new point, given the last one kept. */
export function keepPoint(previous: PositionPoint | null, point: PositionPoint): boolean {
  if (!isUsablePoint(point)) return false;
  if (previous === null) return true;
  const seconds = (Date.parse(point.recordedAt) - Date.parse(previous.recordedAt)) / 1000;
  if (seconds <= 0) return false;
  return (distanceMetres(previous, point) / seconds) * 3.6 <= FASTEST_KMH;
}

const pointReader = v.object({
  latitude: v.number(),
  longitude: v.number(),
  speedKmh: v.nullable(v.number()),
  heading: v.nullable(v.number()),
  accuracyM: v.nullable(v.number()),
  recordedAt: v.timestamp(),
});
const uploadReader = v.object({ tripDayId: v.uuid(), deviceId: v.uuid(), points: v.any() });

export function parsePositionUpload(input: unknown): PositionUpload {
  const { tripDayId, deviceId, points } = uploadReader(input, 'upload');
  if (!Array.isArray(points) || points.length > MAX_POSITIONS_PER_UPLOAD) {
    throw new DomainError('command.invalid', `upload.points must be a list of up to ${MAX_POSITIONS_PER_UPLOAD}`);
  }
  return { tripDayId, deviceId, points: points.map((point, i) => pointReader(point, `upload.points[${i}]`)) };
}

export type LocationState = 'moving' | 'parked' | 'late' | 'day_over';

export interface LocationStatus {
  state: LocationState;
  minutesAgo: number;
}

/**
 * What to tell an Owner about a bus's last known position. The phone's clock can
 * be wrong, so a point cannot look newer than when the server received it.
 */
export function locationStatus(
  last: { speedKmh: number | null; recordedAt: string; receivedAt: string },
  dayRunning: boolean,
  now: string,
): LocationStatus {
  const seenAt = Math.min(Date.parse(last.recordedAt), Date.parse(last.receivedAt));
  const minutesAgo = Math.max(0, Math.floor((Date.parse(now) - seenAt) / 60_000));
  if (!dayRunning) return { state: 'day_over', minutesAgo };
  if (minutesAgo >= LATE_AFTER_MINUTES) return { state: 'late', minutesAgo };
  return { state: (last.speedKmh ?? 0) >= MOVING_KMH ? 'moving' : 'parked', minutesAgo };
}
