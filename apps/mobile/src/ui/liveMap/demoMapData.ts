/**
 * The Live map demo (shown without an active session): real Byron houses with routes planned by
 * the real Suggest (see scripts/build-demo-routes.ts). `useDemoMapData` walks the demo crew along
 * their routes from the car, so the fresh plan fills in with slug trails like a real session.
 */
import { useEffect, useMemo, useState } from "react";
import type { Polygon } from "geojson";
import type { LatLng } from "@knockd/shared";
import { boundingPolygon } from "@/area/planAreas";
import type { MapLead, MapMember } from "@/map/types";
import { crew } from "@/mock";
import { buildRouteProgress, measure, pointAt, type MeasuredLine, type RoutePlan } from "@/routes";
import demo from "./demoRoutes.json";
import type { LiveMapData } from "./types";

/** How far each demo member has got towards their last door (0..1), for the static demo. */
export const DEMO_PROGRESS: Readonly<Record<string, number>> = {
  "m-jas": 0.4,
  "m-sam": 0.6,
  "m-ava": 0.25,
  "m-leo": 0.75,
};
/** Demo trails are sampled this often along the route, like GPS fixes. */
const TRAIL_STEP_M = 8;
/** A little past the last door, so it counts as knocked. */
const PAST_DOOR_M = 4;
const LEAD_GRADES: readonly ("A" | "B" | "C")[] = ["A", "B", "A", "C"];
/** A lead on every Nth door someone has knocked. */
const LEAD_EVERY = 5;

/** Animated demo: seconds to walk to the last door, pause at the end, and frame interval. */
const WALK_S = 90;
const PAUSE_S = 6;
const TICK_MS = 1000;
/** Relative walking speeds in the animation, so the crew doesn't move in lockstep. */
const PACE: Readonly<Record<string, number>> = { "m-jas": 1, "m-sam": 0.9, "m-ava": 0.8, "m-leo": 1.1 };

interface DemoGroup {
  memberIds: string[];
  route: LatLng[];
  knocks: { houseId: string; memberId: string; alongM: number }[];
}

interface DemoRoutes {
  start: LatLng;
  groups: DemoGroup[];
  houses: { houseId: string; ring: number[][] }[];
}

const DEMO = demo as DemoRoutes;

const housePolygon = (ring: number[][]): Polygon => ({ type: "Polygon", coordinates: [ring] });

function ringCentre(ring: number[][]): [number, number] {
  const pts = ring.slice(0, -1);
  const sum = pts.reduce((acc, p) => [acc[0]! + p[0]!, acc[1]! + p[1]!], [0, 0]);
  return [sum[0]! / pts.length, sum[1]! / pts.length];
}

/** Everything that doesn't change as the crew walks, built once. */
const STATIC = (() => {
  const plan: RoutePlan = { start: DEMO.start, groups: DEMO.groups };
  const lines = DEMO.groups.map((g) => measure(g.route));
  const planned = new Set(DEMO.groups.flatMap((g) => g.knocks.map((k) => k.houseId)));
  // Planned doors plus every route (the car sits on a street outside the houses), so none of it is tinted as outskirts.
  const workArea = boundingPolygon([
    ...DEMO.houses.filter((h) => planned.has(h.houseId)).map((h) => housePolygon(h.ring)),
    ...DEMO.groups.map((g) => housePolygon(g.route.map((p) => [p.lng, p.lat]))),
  ]);
  const centre = workArea ? ringCentre(workArea.coordinates[0]!) : [DEMO.start.lng, DEMO.start.lat];
  return {
    plan,
    lines,
    workArea,
    center: [centre[0]!, centre[1]!] as [number, number],
    centreOf: new Map(DEMO.houses.map((h) => [h.houseId, ringCentre(h.ring)])),
    colours: Object.fromEntries(crew.map((m) => [m.id, m.colour])),
    crew: crew.map((m) => ({ memberId: m.id, initials: m.initials, colour: m.colour, isMe: m.isMe })),
    houses: {
      type: "FeatureCollection" as const,
      features: DEMO.houses.map((h) => ({
        type: "Feature" as const,
        properties: { houseId: h.houseId },
        geometry: housePolygon(h.ring),
      })),
    },
  };
})();

/** GPS-like points along the route, from the car to `fraction` of the way to their last door. */
function walkedTrail(group: DemoGroup, line: MeasuredLine, memberId: string, fraction: number): LatLng[] {
  const doors = group.knocks.filter((k) => k.memberId === memberId);
  const lastDoorM = Math.min(line.lengthM, Math.max(0, ...doors.map((d) => d.alongM)) + PAST_DOOR_M);
  const upTo = lastDoorM * Math.min(1, Math.max(0, fraction));
  const steps = Math.floor(upTo / TRAIL_STEP_M);
  return [...Array.from({ length: steps + 1 }, (_, i) => pointAt(line, i * TRAIL_STEP_M)), pointAt(line, upTo)];
}

/** The demo with each member `progress[memberId]` (0..1) of the way to their last door. */
export function buildDemoMapData(progress: Readonly<Record<string, number>> = DEMO_PROGRESS): LiveMapData {
  const trails = Object.fromEntries(
    DEMO.groups.flatMap((g, i) => g.memberIds.map((m) => [m, walkedTrail(g, STATIC.lines[i]!, m, progress[m] ?? 0)])),
  );
  const routes = buildRouteProgress(STATIC.plan, trails);

  const members: MapMember[] = crew.flatMap((m) => {
    const trail = trails[m.id];
    const at = trail?.[trail.length - 1];
    return at
      ? [
          {
            memberId: m.id,
            name: m.name,
            colour: m.colour,
            initials: m.initials,
            lng: at.lng,
            lat: at.lat,
            isMe: m.isMe,
          },
        ]
      : [];
  });

  const knocked = Object.entries(routes.houses).filter(([, h]) => h.knocked && h.n % LEAD_EVERY === 2);
  const leads: MapLead[] = knocked.slice(0, LEAD_GRADES.length).flatMap(([houseId], i) => {
    const c = STATIC.centreOf.get(houseId);
    return c ? [{ id: `l-${i + 1}`, lng: c[0], lat: c[1], grade: LEAD_GRADES[i]! }] : [];
  });

  return {
    center: STATIC.center,
    zoom: 16.6,
    workArea: STATIC.workArea,
    routes,
    colours: STATIC.colours,
    crew: STATIC.crew,
    members,
    trails: { type: "FeatureCollection", features: [] },
    houses: STATIC.houses,
    leads,
  };
}

/** Each member's progress `elapsedS` into the looping walk (everyone starts fresh at the car). */
export function demoProgressAt(elapsedS: number): Record<string, number> {
  const t = elapsedS % (WALK_S + PAUSE_S);
  return Object.fromEntries(crew.map((m) => [m.id, Math.min(1, (t / WALK_S) * (PACE[m.id] ?? 1))]));
}

/** The demo, animated while `animate` is true: the crew walks their routes from the car, then it loops. */
export function useDemoMapData(animate: boolean): LiveMapData {
  const [elapsedS, setElapsedS] = useState(0);
  useEffect(() => {
    if (!animate) return undefined;
    const started = Date.now();
    const id = setInterval(() => setElapsedS((Date.now() - started) / 1000), TICK_MS);
    return () => clearInterval(id);
  }, [animate]);
  return useMemo(() => buildDemoMapData(demoProgressAt(elapsedS)), [elapsedS]);
}

/** Static snapshot of the demo, partway through (tests and previews). */
export const DEMO_MAP_DATA: LiveMapData = buildDemoMapData();
