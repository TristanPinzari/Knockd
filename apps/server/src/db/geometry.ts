import { customType } from "drizzle-orm/pg-core";

type GeometryType = "Point" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon" | "Geometry";

/**
 * PostGIS geometry column (SRID 4326, lat/lng).
 * Values are raw PostGIS strings. Read geometry with `ST_AsGeoJSON(...)` in a `sql` query,
 * and write it with `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` or `ST_GeomFromGeoJSON(...)`.
 */
export const geometry = (name: string, type: GeometryType) =>
  customType<{ data: string; driverData: string }>({
    dataType: () => `geometry(${type}, 4326)`,
  })(name);
