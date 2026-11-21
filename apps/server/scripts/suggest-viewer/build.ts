/**
 * Builds the Suggest viewer: a single HTML page that runs the real suggestRoutes from
 * @knockd/shared on London streets and houses around the Byron demo spot. Paint houses, move the
 * car and regroup pin, and see every option's routes, knock order and U-turns.
 *
 * Output: docs/suggest-viewer.html (self-contained, open it in a browser, no server needed).
 * Rebuild after changing Suggest: pnpm rebuild:suggest-viewer
 * Needs DATABASE_URL (apps/server/.env) to read the map data.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { pg } from "../../src/db/client";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../../../../docs/suggest-viewer.html");
const SHARED = resolve(here, "../../../../packages/shared/src/index.ts");

// Densest residential spot in Byron (the demo location). Streets a bit wider than houses, so
// routes can leave the selection.
const CENTER = { lat: 42.955, lng: -81.3425 };
const STREETS_M = 1500;
const HOUSES_M = 900;
const point = `ST_SetSRID(ST_MakePoint(${CENTER.lng}, ${CENTER.lat}), 4326)::geography`;

const streets = await pg.unsafe<{ id: string; name: string | null; g: { coordinates: [number, number][] } }[]>(
  `SELECT id, name, ST_AsGeoJSON(geom, 6)::json AS g FROM streets WHERE ST_DWithin(geom::geography, ${point}, ${STREETS_M})`,
);
const houses = await pg.unsafe<
  {
    id: string;
    street_id: string | null;
    block_id: string | null;
    lat: string;
    lng: string;
    g: { type: string; coordinates: [number, number][][] };
  }[]
>(
  `SELECT id, street_id, block_id, round(ST_Y(centroid)::numeric, 6) AS lat, round(ST_X(centroid)::numeric, 6) AS lng,
          ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.000005), 6)::json AS g
   FROM houses WHERE ST_DWithin(centroid::geography, ${point}, ${HOUSES_M})`,
);
await pg.end();

const data = {
  center: CENTER,
  streets: streets.map((s) => ({ id: Number(s.id), name: s.name, coordinates: s.g.coordinates })),
  houses: houses
    .filter((h) => h.g.type === "Polygon")
    .map((h) => ({
      id: Number(h.id),
      streetId: h.street_id === null ? null : Number(h.street_id),
      blockId: h.block_id === null ? null : Number(h.block_id),
      lat: Number(h.lat),
      lng: Number(h.lng),
      ring: h.g.coordinates[0],
    })),
};

const bundle = await build({
  entryPoints: [SHARED],
  bundle: true,
  format: "iife",
  globalName: "Knockd",
  platform: "browser",
  target: "es2020",
  write: false,
  minify: true,
});

const html = readFileSync(resolve(here, "template.html"), "utf8")
  .replace("/*SHARED*/", () => bundle.outputFiles[0]!.text)
  .replace("/*DATA*/", () => JSON.stringify(data));
writeFileSync(OUT, html);
console.log(
  `${OUT}\n${data.streets.length} streets, ${data.houses.length} houses, ${(html.length / 1e6).toFixed(1)} MB`,
);
