/** Small SQL helpers shared by the services. */
import { sql, type SQL } from "drizzle-orm";
import type { FeatureCollection } from "geojson";
import { db } from "./client";

/** A bounding box as a PostGIS envelope (SRID 4326). */
export const envelope = (b: { minLng: number; minLat: number; maxLng: number; maxLat: number }) =>
  sql`ST_MakeEnvelope(${b.minLng}, ${b.minLat}, ${b.maxLng}, ${b.maxLat}, 4326)`;

/**
 * Runs a query that returns one GeoJSON Feature per row (as a json column named `f`) and wraps
 * the rows in a FeatureCollection, in the query's order.
 */
export async function featureCollection(rows: SQL): Promise<FeatureCollection> {
  const [r] = await db.execute<{ fc: FeatureCollection }>(sql`
    SELECT json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(x.f), '[]'::json)) AS fc
    FROM (${rows}) x`);
  return r!.fc;
}

/** The Postgres error code (e.g. 23505 unique violation, 23503 foreign key), through Drizzle's wrapper. */
export function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
