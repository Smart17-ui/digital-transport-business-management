import { describe, expect, it } from 'vitest';
import {
  isOffRoute,
  offRouteCount,
  parseOsrmRoutes,
  routeProgress,
  stepInstruction,
  turnAnnouncement,
  type NavRoute,
} from '../src/index.ts';

/** About 1 km going north, then about 1 km going east, turning at the corner. */
const route: NavRoute = {
  distanceM: 2000,
  durationS: 200,
  summary: 'Great East Road',
  geometry: [
    [28.3, -15.4],
    [28.3, -15.391],
    [28.3093, -15.391],
  ],
  steps: [
    { instruction: 'Head off onto Great East Road', startsAtM: 0 },
    { instruction: 'Turn right onto Makishi Road', startsAtM: 1000 },
    { instruction: 'You have arrived', startsAtM: 2000 },
  ],
};

describe('stepInstruction', () => {
  const says = (type: string, modifier?: string, name = '', exit?: number) =>
    stepInstruction({ name, distance: 100, maneuver: { type, modifier, exit } });

  it('names the road when there is one', () => {
    expect(says('turn', 'left', 'Lunsemfwa Road')).toBe('Turn left onto Lunsemfwa Road');
    expect(says('turn', 'left')).toBe('Turn left');
  });

  it('gives the roundabout exit', () => {
    expect(says('roundabout', 'right', 'Great East Road', 2)).toBe('At the roundabout, take exit 2 onto Great East Road');
  });

  it('copes with a kind of turn it has not met', () => {
    expect(says('something new', 'left')).toBe('Turn left');
    expect(says('something new')).toBe('Continue');
  });
});

describe('parseOsrmRoutes', () => {
  it('works out where each turn falls', () => {
    const [parsed] = parseOsrmRoutes({
      code: 'Ok',
      routes: [
        {
          distance: 300,
          duration: 30,
          geometry: { coordinates: [[28.3, -15.4], [28.3, -15.39]] },
          legs: [
            {
              summary: 'Makishi Road',
              steps: [
                { name: 'A', distance: 100, maneuver: { type: 'depart' } },
                { name: 'B', distance: 200, maneuver: { type: 'turn', modifier: 'left' } },
                { name: '', distance: 0, maneuver: { type: 'arrive' } },
              ],
            },
          ],
        },
      ],
    });
    expect(parsed?.steps.map((s) => s.startsAtM)).toEqual([0, 100, 300]);
    expect(parsed?.summary).toBe('Makishi Road');
  });

  it('gives nothing when there is no route', () => {
    expect(parseOsrmRoutes({ code: 'NoRoute' })).toEqual([]);
    expect(parseOsrmRoutes(null)).toEqual([]);
  });
});

describe('routeProgress', () => {
  it('finds the next turn and what is left, partway along', () => {
    const progress = routeProgress(route, -15.3955, 28.3);
    expect(progress.offRouteM).toBeLessThan(1);
    expect(progress.alongM).toBeCloseTo(500, -2);
    expect(progress.remainingM).toBeCloseTo(1500, -2);
    expect(progress.remainingS).toBeCloseTo(150, -1);
    expect(progress.nextStep?.instruction).toBe('Turn right onto Makishi Road');
    expect(progress.toNextStepM).toBeCloseTo(500, -2);
    expect(progress.arrived).toBe(false);
  });

  it('moves on to the next turn once past the corner', () => {
    expect(routeProgress(route, -15.391, 28.305).nextStep?.instruction).toBe('You have arrived');
  });

  it('measures how far off the route the vehicle is', () => {
    expect(routeProgress(route, -15.3955, 28.3005).offRouteM).toBeGreaterThan(40);
  });

  it('arrives near the end of the line', () => {
    expect(routeProgress(route, -15.391, 28.3092).arrived).toBe(true);
  });

  it('does not jump back along a route that doubles back on itself', () => {
    const outAndBack: NavRoute = {
      ...route,
      geometry: [[28.3, -15.4], [28.3, -15.391], [28.3, -15.4]],
      steps: [{ instruction: 'Head off', startsAtM: 0 }, { instruction: 'Make a U-turn', startsAtM: 1000 }],
    };
    // On the way back, the same spot is also on the way out.
    expect(routeProgress(outAndBack, -15.3955, 28.3, 1400).alongM).toBeGreaterThan(1400);
  });
});

describe('offRouteCount', () => {
  it('needs three readings in a row', () => {
    let count = 0;
    count = offRouteCount(count, 80, 10);
    count = offRouteCount(count, 80, 10);
    expect(isOffRoute(count)).toBe(false);
    count = offRouteCount(count, 80, 10);
    expect(isOffRoute(count)).toBe(true);
  });

  it('starts again when back on the route', () => {
    expect(offRouteCount(2, 10, 10)).toBe(0);
  });

  it('ignores a poor GPS fix either way', () => {
    expect(offRouteCount(2, 80, 100)).toBe(2);
    expect(offRouteCount(2, 10, 100)).toBe(2);
  });
});

describe('turnAnnouncement', () => {
  it('stays quiet when the turn is far off', () => {
    expect(turnAnnouncement('Turn left', 900, 'none')).toBeNull();
  });

  it('warns once, then calls the turn once', () => {
    expect(turnAnnouncement('Turn left', 340, 'none')).toEqual({ text: 'In 350 metres, turn left', spoken: 'warned' });
    expect(turnAnnouncement('Turn left', 300, 'warned')).toBeNull();
    expect(turnAnnouncement('Turn left', 50, 'warned')).toEqual({ text: 'Turn left', spoken: 'called' });
    expect(turnAnnouncement('Turn left', 20, 'called')).toBeNull();
  });

  it('goes straight to the call when a turn comes up quickly', () => {
    expect(turnAnnouncement('Turn left', 40, 'none')?.spoken).toBe('called');
  });
});
