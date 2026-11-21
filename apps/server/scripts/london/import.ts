/**
 * Steps 2–3: load the downloaded OSM data into a staging schema, then build
 * streets, blocks and houses with build.sql.
 * Usage: pnpm --filter @knockd/server data:import
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { BUILDINGS_FILE, ROADS_FILE, type OverpassWay } from "./config";

if (existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sql = postgres(url, { max: 1, onnotice: () => {} });
const BATCH = 2000;

async function loadWays(file: string): Promise<OverpassWay[]> {
  if (!existsSync(file)) throw new Error(`Missing ${file}. Run data:download first.`);
  const json = JSON.parse(await readFile(file, "utf8")) as { elements: OverpassWay[] };
  return json.elements.filter((e) => e.type === "way" && (e.geometry?.length ?? 0) >= 2);
}

function toGeoJson(way: OverpassWay, asPolygon: boolean): string | null {
  const coords = way.geometry!.map((p) => [p.lon, p.lat]);
  if (!asPolygon) return JSON.stringify({ type: "LineString", coordinates: coords });
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  const closed = first[0] === last[0] && first[1] === last[1];
  if (!closed || coords.length < 4) return null;
  return JSON.stringify({ type: "Polygon", coordinates: [coords] });
}

async function stage(table: string, ways: OverpassWay[], asPolygon: boolean) {
  const rows = ways
    .map((w) => ({ id: w.id, tags: w.tags ?? {}, geom: toGeoJson(w, asPolygon) }))
    .filter((r) => r.geom !== null);
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await sql`
      INSERT INTO ${sql(table)} (osm_id, tags, geom)
      SELECT (x->>'id')::bigint, x->'tags', ST_SetSRID(ST_GeomFromGeoJSON(x->>'geom'), 4326)
      FROM jsonb_array_elements(${sql.json(batch)}) AS x`;
    process.stdout.write(
      `\r  ${table}: ${Math.min(i + BATCH, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`,
    );
  }
  process.stdout.write("\n");
}

try {
  console.log("1/3 Reading downloaded files...");
  const roads = await loadWays(ROADS_FILE);
  const buildings = await loadWays(BUILDINGS_FILE);

  console.log("2/3 Staging raw OSM data...");
  await sql.unsafe(`
    CREATE SCHEMA IF NOT EXISTS staging;
    DROP TABLE IF EXISTS staging.osm_roads, staging.osm_buildings;
    CREATE TABLE staging.osm_roads (osm_id bigint, tags jsonb, geom geometry(LineString, 4326));
    CREATE TABLE staging.osm_buildings (osm_id bigint, tags jsonb, geom geometry(Polygon, 4326));
  `);
  await stage("staging.osm_roads", roads, false);
  await stage("staging.osm_buildings", buildings, true);

  console.log("3/3 Building streets, blocks and houses (a few minutes)...");
  const buildSql = await readFile(fileURLToPath(new URL("./build.sql", import.meta.url)), "utf8");
  await sql.unsafe(buildSql);

  const [counts] = await sql`
    SELECT (SELECT count(*) FROM streets)::int AS streets,
           (SELECT count(*) FROM blocks)::int AS blocks,
           (SELECT count(*) FROM houses)::int AS houses,
           (SELECT count(*) FROM houses WHERE block_id IS NOT NULL)::int AS houses_in_blocks,
           (SELECT round(avg(house_count))::int FROM blocks) AS avg_houses_per_block`;
  console.log("✓ Done:", counts);
} finally {
  await sql.end();
}
