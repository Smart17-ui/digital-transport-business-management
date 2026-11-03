export const brand = {
  dark: '#0E1116',
  coral: '#FF6347',
  light: '#F2F4F7',
  wordmarkDark: '#12151B',
  wordmarkCoral: '#D2361F',
};

// Coral means the main action, green means money settled, amber means waiting on someone,
// and red is kept for real problems, so a colour always means the same thing.
// Coral is too pale for text: use it as a fill with primaryText on top, never as words on a light screen.
export const colors = {
  background: '#F5F6F8',
  surface: '#FFFFFF',
  text: '#12151B',
  muted: '#5B626C',
  border: '#DFE2E7',
  tint: '#ECEEF2',
  primary: brand.coral,
  primaryText: brand.dark,
  dark: brand.dark,
  onDark: brand.light,
  onDarkMuted: '#AEB4BD',
  waiting: '#8A5A00',
  waitingSoft: '#FFF3D6',
  owes: '#B3261E',
  owesSoft: '#FCE8E6',
  owed: '#0F6B3C',
  owedSoft: '#E6F1EA',
};

export const space = (n: number) => n * 4;

export const radius = { card: 16, control: 12, pill: 999 };

/** Smallest comfortable tap target, for use with one hand on a moving bus. */
export const TAP_TARGET = 52;
