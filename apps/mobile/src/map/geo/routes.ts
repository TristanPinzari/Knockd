/**
 * GeoJSON for the route view: each group's planned route (dashed, cycling through its members'
 * colours), the part already walked as a solid "slug trail" in the same colours, the car, and a
 * numbered badge on every planned door.
 */
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { LatLng } from "@knockd/shared";
import { slice, uTurnPoints, type RouteProgressView } from "@/routes";
import { COLOURS } from "../constants";

/** One member's stripe of a group's line: dash `slot` of `count` (see routeDashes in layers/styles). */
export interface RouteStripeProps {
  colour: string;
  slot: number;
  count: number;
  /** Sideways shift in pixels, so routes sharing a street sit side by side instead of hiding each other. */
  offset: number;
}

/** Pixels between neighbouring routes on a shared street. */
export const ROUTE_SPACING_PX = 4;

export interface BadgeProps {
  houseId: string;
  colour: string;
  n: number;
  knocked: boolean;
}

export interface RouteLayerData {
  /** Full routes, for the white casing under the dashes. */
  casing: FeatureCollection<LineString, { offset: number }>;
  /** What's left to walk: dashed. */
  todo: FeatureCollection<LineString, RouteStripeProps>;
  /** What's been walked: solid slug trail. */
  done: FeatureCollection<LineString, RouteStripeProps>;
  badges: FeatureCollection<Point, BadgeProps>;
  start: FeatureCollection<Point>;
  /** Every place a route turns back on itself (always marked). */
  uTurns: FeatureCollection<Point, { colour: string }>;
  /** House id → fill colour, for every planned door. */
  houseColours: Readonly<Record<string, string>>;
}

const toCoords = (points: readonly LatLng[]): [number, number][] => points.map((p) => [p.lng, p.lat]);

function line<P>(points: readonly LatLng[], properties: P): Feature<LineString, P>[] {
  return points.length >= 2
    ? [{ type: "Feature", properties, geometry: { type: "LineString", coordinates: toCoords(points) } }]
    : [];
}

function point<P>(at: LatLng | readonly [number, number], properties: P): Feature<Point, P> {
  const coordinates: [number, number] = "lat" in at ? [at.lng, at.lat] : [at[0], at[1]];
  return { type: "Feature", properties, geometry: { type: "Point", coordinates } };
}

export function buildRouteLayers(
  view: RouteProgressView,
  colours: Readonly<Record<string, string>>,
  houseCentres: Readonly<Record<string, readonly [number, number]>>,
): RouteLayerData {
  const colourOf = (memberId: string) => colours[memberId] ?? COLOURS.ghostTrail;
  const casing: Feature<LineString, { offset: number }>[] = [];
  const n = view.groups.length;
  const todo: Feature<LineString, RouteStripeProps>[] = [];
  const done: Feature<LineString, RouteStripeProps>[] = [];
  const uTurns: Feature<Point, { colour: string }>[] = [];

  view.groups.forEach(({ group, line: measured, progressM }, i) => {
    const offset = (i - (n - 1) / 2) * ROUTE_SPACING_PX;
    casing.push(...line(group.route, { offset }));
    const colour = colourOf(group.memberIds[0] ?? "");
    for (const at of uTurnPoints(group.route)) uTurns.push(point(at, { colour }));
    const walked = slice(measured, 0, progressM);
    const left = slice(measured, progressM, measured.lengthM);
    group.memberIds.forEach((memberId, slot) => {
      const props = { colour: colourOf(memberId), slot, count: group.memberIds.length, offset };
      todo.push(...line(progressM > 0 ? left : group.route, props));
      done.push(...line(walked, props));
    });
  });

  const badges: Feature<Point, BadgeProps>[] = [];
  const houseColours: Record<string, string> = {};
  for (const [houseId, mark] of Object.entries(view.houses)) {
    const colour = colourOf(mark.memberId);
    houseColours[houseId] = colour;
    const centre = houseCentres[houseId];
    if (centre) badges.push(point(centre, { houseId, colour, n: mark.n, knocked: mark.knocked }));
  }

  return {
    casing: { type: "FeatureCollection", features: casing },
    todo: { type: "FeatureCollection", features: todo },
    done: { type: "FeatureCollection", features: done },
    badges: { type: "FeatureCollection", features: badges },
    start: { type: "FeatureCollection", features: view.start ? [point(view.start, {})] : [] },
    uTurns: { type: "FeatureCollection", features: uTurns },
    houseColours,
  };
}

/** The distinct (slot, count) stripes present, so a layer is made only for each one in use. */
export function stripeKinds(fc: FeatureCollection<LineString, RouteStripeProps>): { slot: number; count: number }[] {
  const seen = new Map<string, { slot: number; count: number }>();
  for (const f of fc.features)
    seen.set(`${f.properties.slot}/${f.properties.count}`, { slot: f.properties.slot, count: f.properties.count });
  return [...seen.values()].sort((a, b) => a.count - b.count || a.slot - b.slot);
}

/** Just the groups I'm in (and their doors), for when the Crew toggle is off. Everything if I'm in none. */
export function onlyMyGroups(view: RouteProgressView, myId: string | null): RouteProgressView {
  const mine = view.groups.filter((g) => myId !== null && g.group.memberIds.includes(myId));
  if (mine.length === 0) return view;
  const members = new Set(mine.flatMap((g) => g.group.memberIds));
  const houses = Object.fromEntries(Object.entries(view.houses).filter(([, h]) => members.has(h.memberId)));
  return { ...view, groups: mine, houses };
}
