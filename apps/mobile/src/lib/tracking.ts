import { keepPoint, MAX_POSITIONS_PER_UPLOAD, type PositionPoint } from '@dt/domain';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import * as Location from 'expo-location';
import { openDatabaseSync } from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import * as TaskManager from 'expo-task-manager';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { colors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

/**
 * Sends a bus's location to its owner from the start of a day until its end. The
 * visible notification comes from a foreground service, which keeps location
 * running with the app closed on "While using the app" permission alone. Points
 * are saved on the phone first, so no signal only delays them.
 */
const TASK = 'dt-vehicle-tracking';
const ACTIVE_KEY = 'dt.tracking-day';
const POINT_EVERY_MS = 20_000;
const UPLOAD_EVERY_MS = 60_000;
const KEEP_UNSENT_MS = 7 * 86_400_000;

const db = openDatabaseSync('digital-transport.db');
db.execSync(`
  create table if not exists queued_positions (
    seq integer primary key autoincrement,
    user_id text not null,
    trip_day_id text not null,
    device_id text not null,
    point text not null,
    saved_at integer not null
  );
`);

interface TrackedDay {
  userId: string;
  tripDayId: string;
  deviceId: string;
}

interface QueuedRow {
  seq: number;
  trip_day_id: string;
  device_id: string;
  point: string;
}

/** Expo Go cannot run location with the app closed, so tracking waits for a real build there. */
export const trackingAvailable = Constants.executionEnvironment !== 'storeClient';

function trackedDay(): TrackedDay | null {
  const saved = Storage.getItemSync(ACTIVE_KEY);
  return saved === null ? null : (JSON.parse(saved) as TrackedDay);
}

let lastKept: PositionPoint | null = null;
let lastUpload = 0;

function toPoint(location: Location.LocationObject): PositionPoint {
  const { latitude, longitude, speed, heading, accuracy } = location.coords;
  return {
    latitude,
    longitude,
    // Phones report -1 when they do not know.
    speedKmh: speed === null || speed < 0 ? null : speed * 3.6,
    heading: heading === null || heading < 0 ? null : heading,
    accuracyM: accuracy,
    recordedAt: new Date(location.timestamp).toISOString(),
  };
}

// Must be defined when this file loads, because Android can start the task with no screen open.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  const day = trackedDay();
  if (error || !data || day === null) return;
  for (const location of data.locations) {
    const point = toPoint(location);
    if (!keepPoint(lastKept, point)) continue;
    lastKept = point;
    await db.runAsync('insert into queued_positions (user_id, trip_day_id, device_id, point, saved_at) values (?, ?, ?, ?, ?)', [
      day.userId,
      day.tripDayId,
      day.deviceId,
      JSON.stringify(point),
      Date.now(),
    ]);
  }
  if (Date.now() - lastUpload >= UPLOAD_EVERY_MS) void uploadPositions(day.userId);
});

let uploading: Promise<void> | null = null;

/** Sends what is saved. Stops quietly at the first failure, and tries again later. */
export function uploadPositions(userId: string): Promise<void> {
  uploading ??= sendSaved(userId)
    .catch(() => undefined)
    .finally(() => {
      uploading = null;
    });
  return uploading;
}

async function sendSaved(userId: string): Promise<void> {
  lastUpload = Date.now();
  // A day whose start was refused never accepts its points, so they cannot wait forever.
  await db.runAsync('delete from queued_positions where saved_at < ?', [Date.now() - KEEP_UNSENT_MS]);
  for (;;) {
    const { data: session } = await supabase.auth.getSession();
    if (session.session?.user.id !== userId) return;

    const [first] = await db.getAllAsync<QueuedRow>('select * from queued_positions where user_id = ? order by seq limit 1', [userId]);
    if (!first) return;
    const rows = await db.getAllAsync<QueuedRow>(
      'select * from queued_positions where user_id = ? and trip_day_id = ? and device_id = ? order by seq limit ?',
      [userId, first.trip_day_id, first.device_id, MAX_POSITIONS_PER_UPLOAD],
    );
    const { error } = await supabase.functions.invoke('command/positions', {
      body: { tripDayId: first.trip_day_id, deviceId: first.device_id, points: rows.map((row) => JSON.parse(row.point)) },
    });
    if (error) return;
    const last = rows[rows.length - 1]!.seq;
    await db.runAsync('delete from queued_positions where user_id = ? and trip_day_id = ? and device_id = ? and seq <= ?', [
      userId,
      first.trip_day_id,
      first.device_id,
      last,
    ]);
  }
}

export type LocationProblem = 'denied' | 'blocked' | 'off' | 'failed';

export const LOCATION_PROBLEMS: Record<LocationProblem, string> = {
  denied: 'Allow location to start your day. Your owner can only see the bus while your day is running.',
  blocked: 'Location is blocked for this app. Open your phone settings, allow location, then come back and try again.',
  off: 'Location is off on your phone. Turn it on to start your day.',
  failed: 'Location could not be turned on. Close the app, open it again and try once more.',
};

function deviceIdFor(userId: string, businessId: string): string {
  const key = `dt.device.${userId}.${businessId}`;
  const saved = Storage.getItemSync(key);
  if (saved !== null) return saved;
  const id = randomUUID();
  Storage.setItemSync(key, id);
  return id;
}

/** Asks for whatever is missing and starts sending. Must be called with the app open. Null means location is on. */
export async function turnOnLocation(day: { userId: string; businessId: string; tripDayId: string }): Promise<LocationProblem | null> {
  if (!trackingAvailable) return null;
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return permission.canAskAgain ? 'denied' : 'blocked';

    if (!(await Location.hasServicesEnabledAsync())) {
      // Shows Android's own "turn on location" prompt, and fails if the driver says no.
      await Location.enableNetworkProviderAsync().catch(() => undefined);
      if (!(await Location.hasServicesEnabledAsync())) return 'off';
    }

    const tracked: TrackedDay = { userId: day.userId, tripDayId: day.tripDayId, deviceId: deviceIdFor(day.userId, day.businessId) };
    Storage.setItemSync(ACTIVE_KEY, JSON.stringify(tracked));
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: POINT_EVERY_MS,
      // By time alone, so a parked bus still shows the phone is working.
      distanceInterval: 0,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'Digital Transport',
        notificationBody: 'Sharing the bus location until you end your day.',
        notificationColor: colors.primary,
        killServiceOnDestroy: false,
      },
    });
    return null;
  } catch {
    Storage.removeItemSync(ACTIVE_KEY);
    return 'failed';
  }
}

/** For the end of a day or signing out. What is saved still gets sent. */
export async function stopTracking(): Promise<void> {
  if (!trackingAvailable) return;
  const day = trackedDay();
  Storage.removeItemSync(ACTIVE_KEY);
  lastKept = null;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
  } catch {
    // Nothing to stop.
  }
  if (day) void uploadPositions(day.userId);
}

/** The day location is meant to be on for, if any. */
export function trackingDayId(): string | null {
  return trackedDay()?.tripDayId ?? null;
}

/** Stops sending if the day being tracked is no longer running: its start was refused, or it ended elsewhere. */
export function stopTrackingUnless(tripDayId: string | null): void {
  const day = trackedDay();
  if (day && day.tripDayId !== tripDayId) void stopTracking();
}

async function isLocationOn(tripDayId: string): Promise<boolean> {
  if (!trackingAvailable) return true;
  try {
    return (
      trackedDay()?.tripDayId === tripDayId &&
      (await Location.hasStartedLocationUpdatesAsync(TASK)) &&
      (await Location.hasServicesEnabledAsync()) &&
      (await Location.getForegroundPermissionsAsync()).granted
    );
  } catch {
    return false;
  }
}

const CHECK_EVERY_MS = 15_000;

/**
 * Whether location is really on for this day, checked again and again: a driver can
 * turn it off in the phone's settings, and restarting the phone stops it. While the
 * screen is open this also sends what is saved, in case the task was held back.
 */
export function useLocationOn(tripDayId: string, userId: string) {
  const [on, setOn] = useState(true);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const next = await isLocationOn(tripDayId);
      if (mounted) setOn(next);
      void uploadPositions(userId);
    };
    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      mounted = false;
      clearInterval(timer);
      appState.remove();
    };
  }, [tripDayId, userId]);

  return { on, recheck: () => void isLocationOn(tripDayId).then(setOn) };
}
