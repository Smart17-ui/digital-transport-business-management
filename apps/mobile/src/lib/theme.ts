// Green means the main action or money settled, amber means waiting on someone,
// and red is kept for real problems, so a colour always means the same thing.
export const colors = {
  background: '#F6F7F5',
  surface: '#FFFFFF',
  text: '#14201A',
  muted: '#5A6660',
  border: '#DFE3DF',
  primary: '#0F6B3C',
  primaryText: '#FFFFFF',
  primarySoft: '#E6F1EA',
  onPrimaryMuted: '#CFE5D8',
  waiting: '#8A5A00',
  waitingSoft: '#FFF3D6',
  owes: '#B3261E',
  owesSoft: '#FCE8E6',
  owed: '#0F6B3C',
};

export const space = (n: number) => n * 4;

export const radius = { card: 16, control: 12, pill: 999 };

/** Smallest comfortable tap target, for use with one hand on a moving bus. */
export const TAP_TARGET = 52;
