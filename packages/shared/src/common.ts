import { z } from "zod";
import type { FeatureCollection, LineString, MultiLineString, MultiPolygon, Point, Polygon } from "geojson";

// ---------- Primitives ----------

export const Uuid = z.string().uuid();

/** ISO 8601 UTC timestamp, e.g. "2026-11-20T21:14:00.000Z" */
export const Timestamp = z.string().datetime();

/** IDs of imported map data (streets, blocks, houses) are database integers. */
export const RefId = z.number().int().positive();

export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLng>;

export const Grade = z.enum(["A", "B", "C"]);
export type Grade = z.infer<typeof Grade>;

export const GradeCounts = z.object({ A: z.number().int(), B: z.number().int(), C: z.number().int() });
export type GradeCounts = z.infer<typeof GradeCounts>;

/** Session join code: 6 characters, no look-alikes (0/O, 1/I/L). */
export const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const JoinCode = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(new RegExp(`^[${JOIN_CODE_ALPHABET}]{6}$`), "Invalid join code"));

export const DisplayName = z.string().trim().min(1).max(40);

// ---------- GeoJSON (validated loosely; shapes come from PostGIS) ----------

export const PointGeo = z.custom<Point>((v) => isGeo(v, "Point"));
export const PolygonGeo = z.custom<Polygon | MultiPolygon>((v) => isGeo(v, "Polygon") || isGeo(v, "MultiPolygon"));
export const LineGeo = z.custom<LineString | MultiLineString>(
  (v) => isGeo(v, "LineString") || isGeo(v, "MultiLineString"),
);
export const FeatureCollectionGeo = z.custom<FeatureCollection>((v) => isGeo(v, "FeatureCollection"));

function isGeo(v: unknown, type: string): boolean {
  return typeof v === "object" && v !== null && (v as { type?: unknown }).type === type;
}

// ---------- Bounding box (query param) ----------

/** Query param `bbox=minLng,minLat,maxLng,maxLat` */
export const Bbox = z.string().transform((s, ctx) => {
  const parts = s.split(",").map(Number);
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isFinite(n)) ||
    minLng === undefined ||
    minLat === undefined ||
    maxLng === undefined ||
    maxLat === undefined ||
    minLng >= maxLng ||
    minLat >= maxLat
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "bbox must be minLng,minLat,maxLng,maxLat" });
    return z.NEVER;
  }
  return { minLng, minLat, maxLng, maxLat };
});
export type Bbox = z.infer<typeof Bbox>;

/** Comma-separated list in a query param, e.g. `grades=A,B` */
export const csv = <T extends z.ZodTypeAny>(item: T) =>
  z
    .string()
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item));

// ---------- Errors ----------

export const ErrorCode = z.enum([
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "session_not_found",
  "session_ended",
  "conflict",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z.object({
  error: z.object({ code: ErrorCode, message: z.string() }),
});
export type ApiError = z.infer<typeof ApiError>;
