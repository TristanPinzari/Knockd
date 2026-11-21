/**
 * Builds two self-contained pages (open in a browser, no server needed) with London streets and
 * houses around the Byron demo spot:
 *  - docs/suggest-viewer.html: runs the real suggestRoutes from @knockd/shared. Paint houses, move
 *    the car and regroup pin, and see every option's routes, knock order and U-turns.
 *  - docs/suggest-ideal.html: mark by hand what Suggest should have done (import the viewer's Copy
 *    data, then fix who knocks which house in which order), to compare and tune Suggest.
 *
 * Rebuild after changing Suggest: pnpm rebuild:suggest-viewer
 * Needs DATABASE_URL (apps/server/.env) to read the map data.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { pg } from "../../src/db/client";

const here = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(here, "../../../../docs");
const PAGES = [
  { template: "template.html", out: "suggest-viewer.html" },
  { template: "ideal.html", out: "suggest-ideal.html" },
];
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

for (const page of PAGES) {
  const html = readFileSync(resolve(here, page.template), "utf8")
    .replace("/*SHARED*/", () => bundle.outputFiles[0]!.text)
    .replace("/*DATA*/", () => JSON.stringify(data));
  const out = resolve(DOCS, page.out);
  writeFileSync(out, html);
  console.log(`${out} (${(html.length / 1e6).toFixed(1)} MB)`);
}
console.log(`${data.streets.length} streets, ${data.houses.length} houses`);
