import { parseOsrmRoutes, type NavRoute } from '@dt/domain';
import * as Speech from 'expo-speech';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

/**
 * Place search and routes from free, public services built on OpenStreetMap, good
 * enough for a pilot. They have no live traffic and no service guarantee, and they
 * are for light use. A paid provider only needs to replace searchPlaces and fetchRoutes.
 */
const PLACES_URL = 'https://photon.komoot.io/api/';
const ROUTES_URL = 'https://router.project-osrm.org/route/v1/driving';
/** West, south, east, north: keeps results inside Zambia. */
const ZAMBIA = '21.9,-18.1,33.8,-8.2';
const TIMEOUT_MS = 10_000;

export interface Place {
  name: string;
  detail: string;
  latitude: number;
  longitude: number;
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'DigitalTransport/1.0' } });
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; street?: string; district?: string; city?: string; state?: string };
}

/** Throws if the service cannot be reached. Nearest places come first. */
export async function searchPlaces(query: string, near: { latitude: number; longitude: number } | null): Promise<Place[]> {
  const params = [`q=${encodeURIComponent(query)}`, 'limit=8', `bbox=${ZAMBIA}`];
  if (near) params.push(`lat=${near.latitude}`, `lon=${near.longitude}`);
  const reply = (await getJson(`${PLACES_URL}?${params.join('&')}`)) as { features?: PhotonFeature[] };

  const seen = new Set<string>();
  return (reply.features ?? []).flatMap((feature) => {
    const { name, street, district, city, state } = feature.properties;
    if (!name) return [];
    const detail = [street, district, city ?? state].filter(Boolean).join(', ');
    const key = `${name}|${detail}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const [longitude, latitude] = feature.geometry.coordinates;
    return [{ name, detail, latitude, longitude }];
  });
}

/** Up to three routes, best first. Empty when there is none. Throws if the service cannot be reached. */
export async function fetchRoutes(
  from: { latitude: number; longitude: number; heading?: number | null },
  to: { latitude: number; longitude: number },
): Promise<NavRoute[]> {
  // The heading stops a new route starting with a U-turn when the driver has gone another way.
  const bearings = from.heading === null || from.heading === undefined ? '' : `&bearings=${Math.round(from.heading) % 360},60;`;
  const url =
    `${ROUTES_URL}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
    `?alternatives=true&steps=true&overview=full&geometries=geojson${bearings}`;
  return parseOsrmRoutes(await getJson(url));
}

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

const RECENT_KEY = 'dt.recent-places';
const MAX_RECENT = 5;

export function recentPlaces(): Place[] {
  const saved = Storage.getItemSync(RECENT_KEY);
  return saved === null ? [] : (JSON.parse(saved) as Place[]);
}

export function rememberPlace(place: Place): void {
  const others = recentPlaces().filter((p) => p.name !== place.name || p.detail !== place.detail);
  Storage.setItemSync(RECENT_KEY, JSON.stringify([place, ...others].slice(0, MAX_RECENT)));
}

const VOICE_KEY = 'dt.voice-off';
let voiceOn = Storage.getItemSync(VOICE_KEY) === null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Spoken directions, on until the driver turns them off. */
export function useVoiceOn(): boolean {
  return useSyncExternalStore(subscribe, () => voiceOn);
}

export function setVoiceOn(on: boolean): void {
  if (on) Storage.removeItemSync(VOICE_KEY);
  else Storage.setItemSync(VOICE_KEY, '1');
  voiceOn = on;
  if (!on) void Speech.stop();
  listeners.forEach((listener) => listener());
}

export function say(text: string): void {
  if (voiceOn) Speech.speak(text, { language: 'en' });
}

export function stopSpeaking(): void {
  void Speech.stop();
}
