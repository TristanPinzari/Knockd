/**
 * Parses the GeoJSON features of GET /area into small typed records. The shared schema only checks
 * `type: "FeatureCollection"`, so each feature is validated here and bad ones are skipped (counted).
 */
import { z } from "zod";
import type { Feature, LineString, Polygon, Position } from "geojson";

const Coord = z.array(z.number()).min(2);
const PolygonGeometry = z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(Coord).min(4)).min(1) });
const LineGeometry = z.object({ type: z.literal("LineString"), coordinates: z.array(Coord).min(2) });
const Id = z.number().int().positive();

const BlockFeature = z.object({
  geometry: PolygonGeometry,
  properties: z.object({ blockId: Id, houseCount: z.number().int().min(0) }),
});
const HouseFeature = z.object({
  geometry: PolygonGeometry,
  properties: z.object({ houseId: Id, blockId: Id, streetId: Id.nullable().optional() }),
});
const StreetFeature = z.object({
  geometry: LineGeometry,
  properties: z.object({ streetId: Id, name: z.string().nullable().optional(), lengthM: z.number().optional() }),
});

/** Ids are database integers on the wire; the map and UI use strings (`onHousePress(houseId: string)`). */
export interface BlockInfo {
  readonly blockId: string;
  readonly houseCount: number;
  readonly polygon: Polygon;
}

export interface HouseInfo {
  readonly houseId: string;
  readonly blockId: string;
  /** The street the house faces, or null if it isn't linked to one. */
  readonly streetId: string | null;
  /** [lng, lat] */
  readonly centre: [number, number];
  readonly feature: Feature<Polygon, { houseId: string; blockId: string }>;
}

export interface StreetInfo {
  readonly streetId: string;
  readonly name: string | null;
  readonly line: LineString;
}

export interface Parsed<T> {
  readonly items: T[];
  readonly skipped: number;
}

function parseAll<S extends z.ZodTypeAny, T>(
  features: readonly unknown[],
  schema: S,
  map: (v: z.infer<S>) => T,
): Parsed<T> {
  const items: T[] = [];
  let skipped = 0;
  for (const f of features) {
    const r = schema.safeParse(f);
    if (r.success) items.push(map(r.data));
    else skipped += 1;
  }
  return { items, skipped };
}

/** Centre of the bounding box of every position (good enough for a house or a block). */
export function bboxCentre(positions: readonly Position[]): [number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of positions) {
    const x = p[0]!;
    const y = p[1]!;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

const toPolygon = (g: z.infer<typeof PolygonGeometry>): Polygon => ({ type: "Polygon", coordinates: g.coordinates });

export function parseBlocks(features: readonly unknown[]): Parsed<BlockInfo> {
  return parseAll(features, BlockFeature, (f) => ({
    blockId: String(f.properties.blockId),
    houseCount: f.properties.houseCount,
    polygon: toPolygon(f.geometry),
  }));
}

export function parseHouses(features: readonly unknown[]): Parsed<HouseInfo> {
  return parseAll(features, HouseFeature, (f) => {
    const houseId = String(f.properties.houseId);
    const blockId = String(f.properties.blockId);
    const polygon = toPolygon(f.geometry);
    const streetId = f.properties.streetId;
    return {
      houseId,
      blockId,
      streetId: streetId === null || streetId === undefined ? null : String(streetId),
      centre: bboxCentre(polygon.coordinates[0]!),
      feature: { type: "Feature", properties: { houseId, blockId }, geometry: polygon },
    };
  });
}

export function parseStreets(features: readonly unknown[]): Parsed<StreetInfo> {
  return parseAll(features, StreetFeature, (f) => ({
    streetId: String(f.properties.streetId),
    name: f.properties.name ?? null,
    line: { type: "LineString", coordinates: f.geometry.coordinates },
  }));
}
