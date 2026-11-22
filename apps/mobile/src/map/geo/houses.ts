import type { Feature, FeatureCollection, Point, Polygon, Position } from "geojson";
import { HOUSE_CORNER_RADIUS_M, HOUSE_SIZE_M } from "../constants";
import { metresToLatDeg, metresToLngDeg, polygonBounds, boundsCentre } from "./geometry";

export interface HouseProps {
  houseId: string;
  /** Fill colour of the person who knocks this door in the plan, or null if it isn't planned. */
  colour: string | null;
}

export interface HouseLayers {
  /** One shape per house: its real outline, or a small rounded square when only the centre is known. */
  squares: FeatureCollection<Polygon, HouseProps>;
  /** Centre points (hit-test layer). */
  centres: FeatureCollection<Point, HouseProps>;
}

const CORNER_STEPS = 3;

export function houseIdOf(f: Feature): string | null {
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const raw = p.houseId ?? p.id ?? f.id;
  return raw === undefined || raw === null ? null : String(raw);
}

function centreOf(f: Feature<Point | Polygon>): Position | null {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === "Point") return g.coordinates;
  if (g.type === "Polygon" && g.coordinates[0]?.length) return boundsCentre(polygonBounds(g));
  return null;
}

/** Rounded square of HOUSE_SIZE_M centred on `c`. */
export function roundedSquare(
  c: Position,
  sizeM: number = HOUSE_SIZE_M,
  radiusM: number = HOUSE_CORNER_RADIUS_M,
): Polygon {
  const lat = c[1]!;
  const half = sizeM / 2;
  const r = Math.min(radiusM, half);
  const inner = half - r;
  // Counter-clockwise: NE, NW, SW, SE corner centres with their arc start angle (degrees).
  const corners: [number, number, number][] = [
    [inner, inner, 0],
    [-inner, inner, 90],
    [-inner, -inner, 180],
    [inner, -inner, 270],
  ];
  const ring: Position[] = [];
  for (const [cx, cy, startDeg] of corners) {
    for (let i = 0; i <= CORNER_STEPS; i++) {
      const a = ((startDeg + (i * 90) / CORNER_STEPS) * Math.PI) / 180;
      ring.push([c[0]! + metresToLngDeg(cx + r * Math.cos(a), lat), lat + metresToLatDeg(cy + r * Math.sin(a))]);
    }
  }
  ring.push(ring[0]!);
  return { type: "Polygon", coordinates: [ring] };
}

export function buildHouseLayers(
  houses: FeatureCollection<Point | Polygon> | undefined,
  colours: Readonly<Record<string, string>> = {},
): HouseLayers {
  const squares: Feature<Polygon, HouseProps>[] = [];
  const centres: Feature<Point, HouseProps>[] = [];
  for (const f of houses?.features ?? []) {
    const id = houseIdOf(f);
    const c = centreOf(f);
    if (id === null || !c) continue;
    const properties = { houseId: id, colour: colours[id] ?? null };
    const shape = f.geometry.type === "Polygon" ? f.geometry : roundedSquare(c);
    squares.push({ type: "Feature", properties, geometry: shape });
    centres.push({ type: "Feature", properties, geometry: { type: "Point", coordinates: c } });
  }
  return {
    squares: { type: "FeatureCollection", features: squares },
    centres: { type: "FeatureCollection", features: centres },
  };
}
