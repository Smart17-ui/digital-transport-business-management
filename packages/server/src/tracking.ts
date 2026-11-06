import { DomainError, isUsablePoint, parsePositionUpload } from '@dt/domain';
import { isoTime, isoTimeOrNull, maybeOne, str, type Database } from './db.ts';

/** How far outside a day's start and end a point may fall, for the moments around pressing the button. */
const GRACE_MS = 5 * 60_000;

/**
 * Stores a batch of positions from a driver's phone. Not a Command: a position
 * changes no one's money, and there are thousands a day, so they stay out of the
 * command log. A resend is still harmless. Points outside the day's start and end
 * are dropped here too, so nobody can be tracked off duty whatever a phone sends.
 */
export async function recordPositions(
  database: Database,
  userId: string,
  input: unknown,
  now: string = new Date().toISOString(),
): Promise<{ accepted: number; dropped: number }> {
  const upload = parsePositionUpload(input);
  return database.asUser(userId, async (db) => {
    const day = await maybeOne(
      db,
      `select business_id, vehicle_id, driver_id, started_at, device_started_at, ended_at, device_ended_at
       from trip_days where id = $1`,
      [upload.tripDayId],
    );
    // Row level security hides the days of a business this person has left. This is also
    // the answer while a day started offline has yet to arrive, so the phone keeps the points.
    if (day === null || str(day.driver_id) !== userId) throw new DomainError('day.not_found');
    const businessId = str(day.business_id);

    // Points carry the phone's clock, so they are compared with the times the same phone gave.
    const from = Date.parse(isoTime(day.device_started_at ?? day.started_at)) - GRACE_MS;
    const endedAt = isoTimeOrNull(day.device_ended_at ?? day.ended_at);
    const to = endedAt === null ? Infinity : Date.parse(endedAt) + GRACE_MS;
    const points = upload.points.filter((point) => {
      const at = Date.parse(point.recordedAt);
      return isUsablePoint(point) && at >= from && at <= to;
    });
    const dropped = upload.points.length - points.length;
    if (points.length === 0) return { accepted: 0, dropped };

    await db.query(
      `insert into devices (id, business_id, vehicle_id, driver_id, type) values ($1, $2, $3, $4, 'phone')
       on conflict (id) do nothing`,
      [upload.deviceId, businessId, day.vehicle_id, userId],
    );
    const device = await maybeOne(db, 'select driver_id from devices where id = $1', [upload.deviceId]);
    if (device === null || str(device.driver_id) !== userId) throw new DomainError('tracking.device_not_yours');

    const rows = JSON.stringify(points);
    const { rows: added } = await db.query(
      `insert into positions (business_id, vehicle_id, trip_day_id, driver_id, device_id, latitude, longitude,
                              speed_kmh, heading, accuracy_m, recorded_at, received_at)
       select $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, p."latitude", p."longitude", p."speedKmh", p."heading",
              p."accuracyM", p."recordedAt", $7::timestamptz
       from jsonb_to_recordset($6::text::jsonb) as p(
         "latitude" double precision, "longitude" double precision, "speedKmh" real, "heading" real,
         "accuracyM" real, "recordedAt" timestamptz)
       on conflict (trip_day_id, device_id, recorded_at) do nothing
       returning id`,
      [businessId, day.vehicle_id, upload.tripDayId, userId, upload.deviceId, rows, now],
    );

    const newest = points.reduce((a, b) => (Date.parse(b.recordedAt) > Date.parse(a.recordedAt) ? b : a));
    await db.query(
      `insert into vehicle_last_positions (vehicle_id, business_id, trip_day_id, driver_id, latitude, longitude,
                                           speed_kmh, heading, accuracy_m, recorded_at, received_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (vehicle_id) do update set
         business_id = excluded.business_id, trip_day_id = excluded.trip_day_id, driver_id = excluded.driver_id,
         latitude = excluded.latitude, longitude = excluded.longitude, speed_kmh = excluded.speed_kmh,
         heading = excluded.heading, accuracy_m = excluded.accuracy_m, recorded_at = excluded.recorded_at,
         received_at = excluded.received_at
       where excluded.recorded_at > vehicle_last_positions.recorded_at`,
      [
        day.vehicle_id, businessId, upload.tripDayId, userId, newest.latitude, newest.longitude,
        newest.speedKmh, newest.heading, newest.accuracyM, newest.recordedAt, now,
      ],
    );
    return { accepted: added.length, dropped: upload.points.length - added.length };
  });
}
