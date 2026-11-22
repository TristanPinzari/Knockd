/**
 * Turns wobbly GPS trails into clean lines for the map: every point within SNAP_M of a loaded
 * street is moved onto that street, a turn from one street onto the next goes through the corner
 * they share, and points that don't change direction are dropped (Douglas–Peucker). Points away
 * from every street (a park, a driveway) stay where they were, just simplified.
 *
 * Only the drawing changes: trail points, progress and stats still use the raw GPS.
 */
import type { FeatureCollection, LineString, Position } from "geojson";

/** GPS points further than this from every street aren't snapped. */
export const SNAP_M = 20;
/** People's pins further than this from every street stay where their GPS puts them. */
export const PIN_SNAP_M = 80;
/** Points closer than this to the straight line between their neighbours are dropped. */
export const SIMPLIFY_M = 3;
/** Two streets meet if their ends are this close. */
const SHARED_END_M = 1;
/** A corner is only added between two points that are both this close to it. */
const CORNER_REACH_M = 40;
/** Grid cell for looking up nearby street segments; must be at least SNAP_M. */
const CELL_M = 50;
const M_PER_DEG = 111_320;

type XY = readonly [number, number];

interface Segment {
  readonly streetId: string;
  readonly a: XY;
  readonly b: XY;
}

export interface StreetIndex {
  readonly origin: { readonly lng: number; readonly lat: number };
  readonly cells: ReadonlyMap<string, readonly Segment[]>;
  /** streetId -> its two end points. */
  readonly ends: ReadonlyMap<string, readonly [XY, XY]>;
}

export interface StreetLine {
  readonly streetId: string;
  readonly line: { readonly coordinates: readonly Position[] };
}

const dist = (p: XY, q: XY) => Math.hypot(p[0] - q[0], p[1] - q[1]);

function projector(origin: { lng: number; lat: number }) {
  const k = M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180);
  return {
    toXY: (p: Position): XY => [(p[0]! - origin.lng) * k, (p[1]! - origin.lat) * M_PER_DEG],
    toPos: ([x, y]: XY): Position => [origin.lng + x / k, origin.lat + y / M_PER_DEG],
  };
}

/** Every cell a segment passes near (its bounding box, grown by SNAP_M). */
function cellsFor(s: Segment): string[] {
  const keys: string[] = [];
  const [x0, x1] = [Math.min(s.a[0], s.b[0]) - SNAP_M, Math.max(s.a[0], s.b[0]) + SNAP_M];
  const [y0, y1] = [Math.min(s.a[1], s.b[1]) - SNAP_M, Math.max(s.a[1], s.b[1]) + SNAP_M];
  for (let i = Math.floor(x0 / CELL_M); i <= Math.floor(x1 / CELL_M); i++)
    for (let j = Math.floor(y0 / CELL_M); j <= Math.floor(y1 / CELL_M); j++) keys.push(`${i},${j}`);
  return keys;
}

export function buildStreetIndex(streets: Readonly<Record<string, StreetLine>>): StreetIndex {
  const all = Object.values(streets);
  const first = all[0]?.line.coordinates[0];
  const origin = first ? { lng: first[0]!, lat: first[1]! } : { lng: 0, lat: 0 };
  const { toXY } = projector(origin);
  const cells = new Map<string, Segment[]>();
  const ends = new Map<string, readonly [XY, XY]>();
  for (const street of all) {
    const pts = street.line.coordinates.map(toXY);
    if (pts.length < 2) continue;
    ends.set(street.streetId, [pts[0]!, pts[pts.length - 1]!]);
    for (let i = 0; i + 1 < pts.length; i++) {
      const seg = { streetId: street.streetId, a: pts[i]!, b: pts[i + 1]! };
      for (const key of cellsFor(seg)) cells.set(key, [...(cells.get(key) ?? []), seg]);
    }
  }
  return { origin, cells, ends };
}

interface Snapped {
  readonly at: XY;
  readonly streetId: string | null;
}

function closestOn(s: Segment, p: XY): XY {
  const [dx, dy] = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / len2));
  return [s.a[0] + t * dx, s.a[1] + t * dy];
}

/** Street segments that may lie within `reachM` of p (each is listed in every cell near it). */
function segmentsNear(index: StreetIndex, p: XY, reachM: number): Iterable<Segment> {
  const ci = Math.floor(p[0] / CELL_M);
  const cj = Math.floor(p[1] / CELL_M);
  const rings = Math.max(0, Math.ceil((reachM - SNAP_M) / CELL_M));
  if (rings === 0) return index.cells.get(`${ci},${cj}`) ?? [];
  const found = new Set<Segment>();
  for (let i = ci - rings; i <= ci + rings; i++)
    for (let j = cj - rings; j <= cj + rings; j++) for (const s of index.cells.get(`${i},${j}`) ?? []) found.add(s);
  return found;
}

function snap(index: StreetIndex, p: XY, reachM: number = SNAP_M): Snapped {
  let best: { at: XY; streetId: string; d: number } | null = null;
  for (const s of segmentsNear(index, p, reachM)) {
    const q = closestOn(s, p);
    const d = dist(p, q);
    if (d <= reachM && (!best || d < best.d)) best = { at: q, streetId: s.streetId, d };
  }
  return best ? { at: best.at, streetId: best.streetId } : { at: p, streetId: null };
}

/** Where to draw someone: on the nearest street within PIN_SNAP_M, else where they are. */
export function snapToStreet(position: Position, index: StreetIndex, reachM: number = PIN_SNAP_M): Position {
  if (index.cells.size === 0) return position;
  const { toXY, toPos } = projector(index.origin);
  const snapped = snap(index, toXY(position), reachM);
  return snapped.streetId === null ? position : toPos(snapped.at);
}

/** The end two streets share, if they meet. */
function sharedEnd(index: StreetIndex, a: string, b: string): XY | null {
  const ea = index.ends.get(a);
  const eb = index.ends.get(b);
  if (!ea || !eb) return null;
  for (const p of ea) for (const q of eb) if (dist(p, q) <= SHARED_END_M) return p;
  return null;
}

/** Snapped points, with the shared corner added wherever the walk turns onto another street. */
function snapWithCorners(index: StreetIndex, pts: readonly XY[]): XY[] {
  const out: XY[] = [];
  let prev: Snapped | null = null;
  for (const p of pts) {
    const cur = snap(index, p);
    if (prev?.streetId && cur.streetId && prev.streetId !== cur.streetId) {
      const corner = sharedEnd(index, prev.streetId, cur.streetId);
      if (corner && dist(corner, prev.at) <= CORNER_REACH_M && dist(corner, cur.at) <= CORNER_REACH_M) out.push(corner);
    }
    out.push(cur.at);
    prev = cur;
  }
  return out;
}

function offLine(p: XY, a: XY, b: XY): number {
  return dist(p, closestOn({ streetId: "", a, b }, p));
}

/** Douglas–Peucker: keep only the points that bend the line by more than `tolerance` metres. */
function simplify(pts: readonly XY[], tolerance: number): XY[] {
  if (pts.length < 3) return [...pts];
  const keep = pts.map((_, i) => i === 0 || i === pts.length - 1);
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    let far = -1;
    let farD = tolerance;
    for (let i = from + 1; i < to; i++) {
      const d = offLine(pts[i]!, pts[from]!, pts[to]!);
      if (d > farD) [far, farD] = [i, d];
    }
    if (far < 0) continue;
    keep[far] = true;
    stack.push([from, far], [far, to]);
  }
  return pts.filter((_, i) => keep[i]);
}

/** One trail line, snapped to streets and straightened. */
export function cleanLine(coordinates: readonly Position[], index: StreetIndex): Position[] {
  if (coordinates.length < 2) return [...coordinates];
  const { toXY, toPos } = projector(index.origin);
  const snapped = snapWithCorners(index, coordinates.map(toXY));
  return simplify(snapped, SIMPLIFY_M).map(toPos);
}

/** Every trail cleaned; the same object back when there are no streets to snap to. */
export function cleanTrails<P>(
  trails: FeatureCollection<LineString, P>,
  index: StreetIndex,
): FeatureCollection<LineString, P> {
  if (index.cells.size === 0) return trails;
  return {
    ...trails,
    features: trails.features.map((f) => ({
      ...f,
      geometry: { ...f.geometry, coordinates: cleanLine(f.geometry.coordinates, index) },
    })),
  };
}
