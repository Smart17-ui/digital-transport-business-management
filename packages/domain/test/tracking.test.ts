import { describe, expect, it } from 'vitest';
import { keepPoint, locationStatus, parsePositionUpload, type PositionPoint } from '../src/index.ts';

const point = (over: Partial<PositionPoint> = {}): PositionPoint => ({
  latitude: -15.4167,
  longitude: 28.2833,
  speedKmh: 30,
  heading: 90,
  accuracyM: 10,
  recordedAt: '2026-11-05T08:00:00.000Z',
  ...over,
});

describe('keepPoint', () => {
  it('keeps a first good point', () => {
    expect(keepPoint(null, point())).toBe(true);
  });

  it('drops a point the phone was unsure of, or one with no fix', () => {
    expect(keepPoint(null, point({ accuracyM: 51 }))).toBe(false);
    expect(keepPoint(null, point({ latitude: 0, longitude: 0 }))).toBe(false);
  });

  it('keeps ordinary driving: about 500 m in 30 seconds', () => {
    expect(keepPoint(point(), point({ latitude: -15.4122, recordedAt: '2026-11-05T08:00:30.000Z' }))).toBe(true);
  });

  it('drops a jump no bus could make: about 11 km in 20 seconds', () => {
    expect(keepPoint(point(), point({ latitude: -15.3167, recordedAt: '2026-11-05T08:00:20.000Z' }))).toBe(false);
  });

  it('accepts the same jump after a long gap, so one bad point cannot block the rest', () => {
    expect(keepPoint(point(), point({ latitude: -15.3167, recordedAt: '2026-11-05T08:30:00.000Z' }))).toBe(true);
  });

  it('drops a point that is not newer', () => {
    expect(keepPoint(point(), point())).toBe(false);
  });
});

describe('parsePositionUpload', () => {
  const ids = { tripDayId: '7b3c7f5e-2f0c-4a57-9a7a-1f1d8a2c9e01', deviceId: '7b3c7f5e-2f0c-4a57-9a7a-1f1d8a2c9e02' };

  it('reads a good upload', () => {
    expect(parsePositionUpload({ ...ids, points: [point()] }).points).toHaveLength(1);
  });

  it('refuses too many points or a bad one', () => {
    expect(() => parsePositionUpload({ ...ids, points: Array(201).fill(point()) })).toThrow();
    expect(() => parsePositionUpload({ ...ids, points: [{ ...point(), latitude: 'north' }] })).toThrow();
  });
});

describe('locationStatus', () => {
  const at = { recordedAt: '2026-11-05T08:00:00.000Z', receivedAt: '2026-11-05T08:00:30.000Z' };

  it('tells moving from parked while the day runs', () => {
    expect(locationStatus({ ...at, speedKmh: 40 }, true, '2026-11-05T08:01:00.000Z').state).toBe('moving');
    expect(locationStatus({ ...at, speedKmh: 1 }, true, '2026-11-05T08:01:00.000Z').state).toBe('parked');
  });

  it('never presents an old position as live', () => {
    expect(locationStatus({ ...at, speedKmh: 40 }, true, '2026-11-05T08:25:00.000Z')).toEqual({ state: 'late', minutesAgo: 25 });
  });

  it('says the day is over once it has ended', () => {
    expect(locationStatus({ ...at, speedKmh: 0 }, false, '2026-11-05T09:00:00.000Z').state).toBe('day_over');
  });

  it('does not trust a phone clock set ahead', () => {
    const ahead = { recordedAt: '2026-11-05T10:00:00.000Z', receivedAt: '2026-11-05T08:00:00.000Z', speedKmh: 40 };
    expect(locationStatus(ahead, true, '2026-11-05T08:30:00.000Z').state).toBe('late');
  });
});
