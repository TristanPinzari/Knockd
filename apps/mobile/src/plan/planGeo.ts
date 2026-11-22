/**
 * The shared plan as GeoJSON for the map: claimed blocks, lines, route arrow tips and notes.
 *
 * Routes drawn for a member are already drawn (dashed, in their colour, with numbered doors) by the
 * route layers (src/routes), so here they only get their arrow tip. Everything else is drawn here:
 * freehand lines, routes in a utility colour, claims and notes.
 */
import type { FeatureCollection, LineString, Point, Polygon, Position } from "geojson";
import { distanceM, type Drawing, type LatLng, type PlanContent } from "@knockd/shared";

/** Colour for anything whose member isn't known yet (e.g. they just left). */
export const UNKNOWN_COLOUR = "#9AA3AD";
/** Length of each side of a route's arrow tip, in metres. */
export const ARROW_SIDE_M = 9;
const ARROW_SPREAD_DEG = 28;

export interface PlanGeo {
  /** Claimed blocks: filled in the first claimer's colour, outlined in the last one's (a pair shows both). */
  readonly claims: FeatureCollection<Polygon, { blockId: number; fill: string; outline: string; count: number }>;
  /** Freehand lines, and routes in a utility colour. */
  readonly lines: FeatureCollection<LineString, { id: string; colour: string; dashed: boolean }>;
  /** A chevron at the end of every route. */
  readonly arrows: FeatureCollection<LineString, { colour: string }>;
  readonly notes: FeatureCollection<Point, { id: string; colour: string; text: string }>;
}

export interface BlockShape {
  readonly blockId: string;
  readonly polygon: Polygon;
}

const fc = <G extends Polygon | LineString | Point, P>(
  features: { geometry: G; properties: P }[],
): FeatureCollection<G, P> => ({
  type: "FeatureCollection",
  features: features.map((f) => ({ type: "Feature", ...f })),
});

const toPos = (p: LatLng): Position => [p.lng, p.lat];

function colourOf(item: { memberId: string | null; colour: string | null }, colours: Readonly<Record<string, string>>) {
  if (item.colour) return item.colour;
  return (item.memberId && colours[item.memberId]) || UNKNOWN_COLOUR;
}

/** A point `metres` away from `from` on compass bearing `deg`. */
function offset(from: LatLng, deg: number, metres: number): LatLng {
  const rad = (deg * Math.PI) / 180;
  const dLat = (metres * Math.cos(rad)) / 111_320;
  const dLng = (metres * Math.sin(rad)) / (111_320 * Math.cos((from.lat * Math.PI) / 180));
  return { lat: from.lat + dLat, lng: from.lng + dLng };
}

/** Compass bearing from a to b, in degrees. */
function bearing(a: LatLng, b: LatLng): number {
  const kx = Math.cos((a.lat * Math.PI) / 180);
  return (Math.atan2((b.lng - a.lng) * kx, b.lat - a.lat) * 180) / Math.PI;
}

/** The chevron at the end of a line, pointing the way it was drawn. Null for a line with no length. */
export function arrowTip(points: readonly LatLng[]): Position[] | null {
  const end = points[points.length - 1];
  // The last point far enough back to give a steady direction.
  const from = end && [...points].reverse().find((p) => distanceM(p, end) > 3);
  if (!end || !from) return null;
  const back = bearing(end, from);
  return [
    toPos(offset(end, back - ARROW_SPREAD_DEG, ARROW_SIDE_M)),
    toPos(end),
    toPos(offset(end, back + ARROW_SPREAD_DEG, ARROW_SIDE_M)),
  ];
}

const isMemberRoute = (d: Drawing) => d.kind === "route" && d.memberId !== null;

export function buildPlanGeo(
  plan: PlanContent | null,
  blocks: Readonly<Record<string, BlockShape>>,
  colours: Readonly<Record<string, string>>,
): PlanGeo {
  const claimers = new Map<number, string[]>();
  for (const c of plan?.claims ?? []) claimers.set(c.blockId, [...(claimers.get(c.blockId) ?? []), c.memberId]);
  const claims = [...claimers].flatMap(([blockId, members]) => {
    const block = blocks[String(blockId)];
    if (!block) return [];
    const fill = colours[members[0]!] ?? UNKNOWN_COLOUR;
    const outline = colours[members[members.length - 1]!] ?? UNKNOWN_COLOUR;
    return [{ geometry: block.polygon, properties: { blockId, fill, outline, count: members.length } }];
  });

  const drawings = plan?.drawings ?? [];
  const lines = drawings
    .filter((d) => !isMemberRoute(d))
    .map((d) => ({
      geometry: { type: "LineString" as const, coordinates: d.points.map(toPos) },
      properties: { id: d.id, colour: colourOf(d, colours), dashed: d.kind === "route" },
    }));
  const arrows = drawings.flatMap((d) => {
    const tip = d.kind === "route" ? arrowTip(d.points) : null;
    return tip
      ? [{ geometry: { type: "LineString" as const, coordinates: tip }, properties: { colour: colourOf(d, colours) } }]
      : [];
  });
  const notes = (plan?.notes ?? []).map((n) => ({
    geometry: { type: "Point" as const, coordinates: toPos(n) },
    properties: { id: n.id, colour: colourOf(n, colours), text: n.text },
  }));

  return { claims: fc(claims), lines: fc(lines), arrows: fc(arrows), notes: fc(notes) };
}

/** Every loaded block, for the claim tool's tap targets and outlines. */
export function blocksGeo(
  blocks: Readonly<Record<string, BlockShape>>,
): FeatureCollection<Polygon, { blockId: number }> {
  return fc(
    Object.values(blocks).flatMap((b) =>
      Number.isFinite(Number(b.blockId)) ? [{ geometry: b.polygon, properties: { blockId: Number(b.blockId) } }] : [],
    ),
  );
}

export const EMPTY_PLAN_GEO: PlanGeo = buildPlanGeo(null, {}, {});
