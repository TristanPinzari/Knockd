/**
 * Measuring along a route (a polyline of lat/lng points): where a point projects onto it, the point
 * at a given distance, and slices between two distances. Uses a local flat projection, which is
 * accurate to well under a metre at street scale.
 */
import { distanceM, type LatLng } from "@knockd/shared";

const M_PER_DEG = 111_320;

export interface MeasuredLine {
  readonly points: readonly LatLng[];
  /** Distance from the start to each point, in metres (cum[0] = 0). */
  readonly cum: readonly number[];
  readonly lengthM: number;
}

export interface Projection {
  /** Distance along the line to the projected point, in metres. */
  readonly alongM: number;
  /** Distance from the point to the line, in metres. */
  readonly offM: number;
  /** Positive when the point is left of the line's direction of travel, negative when right. */
  readonly side: number;
}

export function measure(points: readonly LatLng[]): MeasuredLine {
  const cum = points.map(() => 0);
  for (let i = 1; i < points.length; i++) cum[i] = cum[i - 1]! + distanceM(points[i - 1]!, points[i]!);
  return { points, cum, lengthM: cum[cum.length - 1] ?? 0 };
}

/** Metres east/north of `origin`. */
function toXY(origin: LatLng, p: LatLng): [number, number] {
  const k = Math.cos((origin.lat * Math.PI) / 180);
  return [(p.lng - origin.lng) * M_PER_DEG * k, (p.lat - origin.lat) * M_PER_DEG];
}

function projectOnSegment(line: MeasuredLine, i: number, p: LatLng): Projection {
  const a = line.points[i]!;
  const b = line.points[i + 1]!;
  const [bx, by] = toXY(a, b);
  const [px, py] = toXY(a, p);
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, (px * bx + py * by) / len2));
  const segM = line.cum[i + 1]! - line.cum[i]!;
  return {
    alongM: line.cum[i]! + t * segM,
    offM: Math.hypot(px - t * bx, py - t * by),
    side: bx * py - by * px,
  };
}

/**
 * The closest projection of `p` onto the part of the line between `fromM` and `toM`, or null if the
 * line has fewer than two points. Ties go to the earlier position.
 */
export function project(line: MeasuredLine, p: LatLng, fromM = 0, toM = Infinity): Projection | null {
  let best: Projection | null = null;
  for (let i = 0; i + 1 < line.points.length; i++) {
    if (line.cum[i + 1]! < fromM || line.cum[i]! > toM) continue;
    const proj = projectOnSegment(line, i, p);
    const clamped = Math.min(toM, Math.max(fromM, proj.alongM));
    const candidate =
      clamped === proj.alongM ? proj : { ...proj, alongM: clamped, offM: distanceM(p, pointAt(line, clamped)) };
    if (!best || candidate.offM < best.offM) best = candidate;
  }
  return best;
}

/** The point `alongM` metres from the start (clamped to the line). */
export function pointAt(line: MeasuredLine, alongM: number): LatLng {
  const pts = line.points;
  if (pts.length === 0) throw new Error("pointAt: empty line");
  if (alongM <= 0 || pts.length === 1) return pts[0]!;
  if (alongM >= line.lengthM) return pts[pts.length - 1]!;
  let i = 0;
  while (i + 2 < pts.length && line.cum[i + 1]! < alongM) i++;
  const segM = line.cum[i + 1]! - line.cum[i]!;
  const t = segM === 0 ? 0 : (alongM - line.cum[i]!) / segM;
  const a = pts[i]!;
  const b = pts[i + 1]!;
  return { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
}

/** The part of the line between two distances, as points (empty if it would be shorter than 2 points). */
export function slice(line: MeasuredLine, fromM: number, toM: number): LatLng[] {
  const from = Math.max(0, fromM);
  const to = Math.min(line.lengthM, toM);
  if (line.points.length < 2 || to <= from) return [];
  const inner = line.points.filter((_, i) => line.cum[i]! > from && line.cum[i]! < to);
  return [pointAt(line, from), ...inner, pointAt(line, to)];
}
