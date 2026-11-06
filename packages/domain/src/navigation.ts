/**
 * Turn-by-turn guidance on a route, separate from who supplied the route: a paid
 * provider with live traffic only needs its own parser to replace parseOsrmRoutes.
 */
export interface RouteStep {
  instruction: string;
  /** How far along the route this turn is. */
  startsAtM: number;
}

export interface NavRoute {
  distanceM: number;
  durationS: number;
  /** The main roads, to tell one route from another. */
  summary: string;
  /** [longitude, latitude] pairs. */
  geometry: [number, number][];
  steps: RouteStep[];
}

interface OsrmStep {
  name?: string;
  distance: number;
  maneuver: { type: string; modifier?: string; exit?: number };
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: { summary?: string; steps: OsrmStep[] }[];
}

const TURNS: Record<string, string> = {
  uturn: 'Make a U-turn',
  'sharp right': 'Turn sharp right',
  right: 'Turn right',
  'slight right': 'Keep right',
  straight: 'Continue straight',
  'slight left': 'Keep left',
  left: 'Turn left',
  'sharp left': 'Turn sharp left',
};

export function stepInstruction(step: OsrmStep): string {
  const { type, modifier, exit } = step.maneuver;
  const turn = TURNS[modifier ?? ''] ?? 'Continue';
  const onto = step.name ? ` onto ${step.name}` : '';
  switch (type) {
    case 'arrive':
      return 'You have arrived';
    case 'depart':
      return `Head off${onto}`;
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return exit ? `At the roundabout, take exit ${exit}${onto}` : `Go through the roundabout${onto}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Leave the roundabout${onto}`;
    case 'new name':
      return `Continue${onto}`;
    case 'merge':
      return `Merge${onto}`;
    case 'on ramp':
    case 'off ramp':
      return `Take the slip road${onto}`;
    case 'fork':
      return `${modifier?.includes('left') ? 'Keep left' : 'Keep right'} at the fork${onto}`;
    case 'end of road':
      return `${turn} at the end of the road${onto}`;
    default:
      return `${turn}${onto}`;
  }
}

/** Reads a route service's reply. No route between the two points gives an empty list. */
export function parseOsrmRoutes(reply: unknown): NavRoute[] {
  const { code, routes } = (reply ?? {}) as { code?: string; routes?: OsrmRoute[] };
  if (code !== 'Ok' || !routes) return [];
  return routes.map((route) => {
    const leg = route.legs[0];
    let at = 0;
    const steps = (leg?.steps ?? []).map((step) => {
      const parsed = { instruction: stepInstruction(step), startsAtM: at };
      at += step.distance;
      return parsed;
    });
    return {
      distanceM: route.distance,
      durationS: route.duration,
      summary: leg?.summary ?? '',
      geometry: route.geometry.coordinates,
      steps,
    };
  });
}

export interface RouteProgress {
  /** How far the vehicle is from the route line. */
  offRouteM: number;
  alongM: number;
  remainingM: number;
  remainingS: number;
  /** The next turn, or null when only the arrival is left. */
  nextStep: RouteStep | null;
  toNextStepM: number;
  arrived: boolean;
}

const METRES_PER_DEGREE = 111_320;
/** Lets the vehicle fall back a little without the guidance jumping to where a route doubles back. */
const BACKTRACK_M = 150;
const ARRIVED_M = 30;

export function routeProgress(route: NavRoute, latitude: number, longitude: number, previousAlongM = 0): RouteProgress {
  const xScale = METRES_PER_DEGREE * Math.cos((latitude * Math.PI) / 180);
  const toXY = ([lng, lat]: [number, number]) => [(lng - longitude) * xScale, (lat - latitude) * METRES_PER_DEGREE] as const;

  const points = route.geometry.map(toXY);
  const segmentLengths = points.slice(1).map((point, i) => Math.hypot(point[0] - points[i]![0], point[1] - points[i]![1]));
  const lineLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  // The line and the service's distance differ slightly, and everything else is in the service's terms.
  const scale = lineLength > 0 ? route.distanceM / lineLength : 1;

  let best = { distance: Infinity, along: 0 };
  let walked = 0;
  for (let i = 0; i < segmentLengths.length; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[i + 1]!;
    const length = segmentLengths[i]!;
    const t = length === 0 ? 0 : Math.min(1, Math.max(0, -(ax * (bx - ax) + ay * (by - ay)) / (length * length)));
    const distance = Math.hypot(ax + t * (bx - ax), ay + t * (by - ay));
    const along = (walked + t * length) * scale;
    if (distance < best.distance && along >= previousAlongM - BACKTRACK_M) best = { distance, along };
    walked += length;
  }

  const alongM = best.along;
  const remainingM = Math.max(0, route.distanceM - alongM);
  const nextStep = route.steps.find((step, i) => i > 0 && step.startsAtM > alongM + 5) ?? null;
  const [endX, endY] = points[points.length - 1] ?? [Infinity, Infinity];
  return {
    offRouteM: best.distance,
    alongM,
    remainingM,
    remainingS: route.distanceM > 0 ? (route.durationS * remainingM) / route.distanceM : 0,
    nextStep,
    toNextStepM: nextStep ? nextStep.startsAtM - alongM : remainingM,
    arrived: Math.hypot(endX, endY) <= ARRIVED_M,
  };
}

const OFF_ROUTE_M = 40;
const WORST_FIX_M = 30;
const OFF_ROUTE_READINGS = 3;

/** Counts readings in a row away from the route. A poor GPS fix neither counts nor clears it. */
export function offRouteCount(previous: number, offRouteM: number, accuracyM: number | null): number {
  if (accuracyM !== null && accuracyM > WORST_FIX_M) return previous;
  return offRouteM > OFF_ROUTE_M ? previous + 1 : 0;
}

export function isOffRoute(count: number): boolean {
  return count >= OFF_ROUTE_READINGS;
}

const WARN_M = 400;
const NOW_M = 60;

/** What has been said about the next turn: nothing, the early warning, or the final call. */
export type SpokenStage = 'none' | 'warned' | 'called';

/** What to say now about the next turn, if anything. */
export function turnAnnouncement(
  instruction: string,
  distanceM: number,
  spoken: SpokenStage,
): { text: string; spoken: SpokenStage } | null {
  if (spoken !== 'called' && distanceM <= NOW_M) return { text: instruction, spoken: 'called' };
  if (spoken === 'none' && distanceM <= WARN_M) {
    const rounded = Math.round(distanceM / 50) * 50;
    return { text: `In ${rounded} metres, ${instruction.charAt(0).toLowerCase()}${instruction.slice(1)}`, spoken: 'warned' };
  }
  return null;
}
