import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

export const brand = {
  dark: '#0E1116',
  green: '#22C55E',
  light: '#F2F4F7',
};

// Bright green means the main action, deep green means money settled, amber means waiting on someone,
// and red is kept for real problems, so a colour always means the same thing.
// Bright green is too pale for text: use it as a fill with primaryText on top, never as words on a light screen.
const LIGHT = {
  background: '#F5F6F8',
  surface: '#FFFFFF',
  text: '#12151B',
  muted: '#5B626C',
  border: '#E4E7EB',
  borderStrong: '#8E96A1',
  tint: '#ECEEF2',
  primary: brand.green,
  primaryText: brand.dark,
  /** The welcome screens and the splash, which stay dark in both modes. */
  dark: brand.dark,
  /** The summary cards at the top of a screen. */
  hero: brand.dark,
  onDark: brand.light,
  onDarkMuted: '#AEB4BD',
  waiting: '#8A5A00',
  waitingSoft: '#FFF3D6',
  owes: '#B3261E',
  owesSoft: '#FCE8E6',
  owed: '#0F6B3C',
  owedSoft: '#E6F1EA',
};

const DARK: typeof LIGHT = {
  background: brand.dark,
  surface: '#171B22',
  text: brand.light,
  muted: '#A3AAB5',
  border: '#2A303A',
  borderStrong: '#5B626C',
  tint: '#232832',
  primary: brand.green,
  primaryText: brand.dark,
  dark: brand.dark,
  hero: '#1F252E',
  onDark: brand.light,
  onDarkMuted: '#AEB4BD',
  waiting: '#F5C34D',
  waitingSoft: '#3A2C0B',
  owes: '#F28B82',
  owesSoft: '#3B1513',
  owed: '#4ADE80',
  owedSoft: '#12301F',
};

export type ThemeMode = 'system' | 'light' | 'dark';

const MODE_KEY = 'dt.theme';

function savedMode(): ThemeMode {
  const saved = Storage.getItemSync(MODE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

function isDark(mode: ThemeMode): boolean {
  return mode === 'system' ? Appearance.getColorScheme() === 'dark' : mode === 'dark';
}

/** Tells the phone too, so its own alerts and keyboard match, and so "system" reads the phone's setting again. */
function applyToPhone(next: ThemeMode): void {
  Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
}

let mode = savedMode();
let version = 0;
const listeners = new Set<() => void>();
applyToPhone(mode);

/** Always the current colours: this one object is filled in again when the mode changes. */
export const colors = { ...(isDark(mode) ? DARK : LIGHT) };

/**
 * The chosen mode, and a number that changes with it. The app is redrawn under that number,
 * so screens need no colour plumbing. A phone that changes its own setting is followed on the
 * next launch, not straight away: the redraw would lose what a driver is halfway through typing.
 */
export function useThemeMode() {
  return { mode: useSyncExternalStore(subscribe, () => mode), version: useSyncExternalStore(subscribe, () => version), dark: isDark(mode) };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setThemeMode(next: ThemeMode): void {
  Storage.setItemSync(MODE_KEY, next);
  applyToPhone(next);
  mode = next;
  version += 1;
  Object.assign(colors, isDark(next) ? DARK : LIGHT);
  listeners.forEach((listener) => listener());
}

/** Styles that are worked out again after the mode changes. Use in place of a plain StyleSheet.create. */
export function themedStyles<T extends object>(make: () => T): T {
  let built = make();
  let builtFor = version;
  return new Proxy({} as T, {
    get(_target, key) {
      if (builtFor !== version) {
        built = make();
        builtFor = version;
      }
      return built[key as keyof T];
    },
  });
}

export const space = (n: number) => n * 4;

export const radius = { card: 14, control: 12, pill: 999 };

/** The only text sizes in the app. Fewer sizes is most of what makes a screen look calm. */
export const type = {
  display: { fontSize: 36, lineHeight: 42, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  heading: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
} as const;

/** Smallest comfortable tap target, for use with one hand on a moving bus. */
export const TAP_TARGET = 52;
