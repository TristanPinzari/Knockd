/**
 * Step 1: download London roads and buildings from OpenStreetMap (Overpass API).
 * London is split into a grid of small tiles so each request is quick. Finished tiles
 * are cached in data/osm/tiles/, so re-running resumes where it left off.
 * Usage: pnpm --filter @knockd/server data:download [--force]
 * Data © OpenStreetMap contributors (ODbL).
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { BUILDINGS_FILE, DATA_DIR, LONDON_BBOX, OVERPASS_URLS, ROADS_FILE, type OverpassWay } from "./config";

const GRID = 4;
const TILES_DIR = path.join(DATA_DIR, "tiles");
const force = process.argv.includes("--force");

const kinds = [
  { name: "roads", file: ROADS_FILE, filter: `way["highway"]` },
  { name: "buildings", file: BUILDINGS_FILE, filter: `way["building"]` },
] as const;

if (force) await rm(DATA_DIR, { recursive: true, force: true });
await mkdir(TILES_DIR, { recursive: true });

const { south, west, north, east } = LONDON_BBOX;
const dLat = (north - south) / GRID;
const dLng = (east - west) / GRID;

for (const kind of kinds) {
  if (existsSync(kind.file)) {
    console.log(`✓ ${kind.name}: already downloaded. Use --force to re-download.`);
    continue;
  }
  const byId = new Map<number, OverpassWay>();
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const tile = `${kind.name}-${i}-${j}`;
      const tileFile = path.join(TILES_DIR, `${tile}.json`);
      let ways: OverpassWay[];
      if (existsSync(tileFile)) {
        ways = JSON.parse(await readFile(tileFile, "utf8")) as OverpassWay[];
      } else {
        const s = south + i * dLat;
        const w = west + j * dLng;
        const bbox = `${s},${w},${s + dLat},${w + dLng}`;
        const query = `[out:json][timeout:180];${kind.filter}(${bbox});out tags geom;`;
        ways = (await queryOverpass(query, tile)) as OverpassWay[];
        await writeFile(tileFile, JSON.stringify(ways));
      }
      for (const way of ways) byId.set(way.id, way); // roads crossing tiles appear twice
      console.log(`  ${tile}: ${ways.length.toLocaleString()} ways (${byId.size.toLocaleString()} total)`);
    }
  }
  await writeFile(kind.file, JSON.stringify({ elements: [...byId.values()] }));
  console.log(`✓ ${kind.name}: ${byId.size.toLocaleString()} ways → ${kind.file}`);
}

/** Tries each server up to 3 times, waiting longer between rounds. */
async function queryOverpass(query: string, label: string): Promise<unknown[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const url of OVERPASS_URLS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          body: new URLSearchParams({ data: query }),
          headers: { "User-Agent": "knockd-data-import" },
          signal: AbortSignal.timeout(200_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { elements: unknown[]; remark?: string };
        if (json.remark) throw new Error(json.remark);
        return json.elements;
      } catch (err) {
        console.log(`  ${label}: ${new URL(url).host} failed (${(err as Error).message})`);
      }
    }
    const waitS = attempt * 20;
    console.log(`  ${label}: retrying in ${waitS}s...`);
    await new Promise((r) => setTimeout(r, waitS * 1000));
  }
  throw new Error(`Overpass ${label}: all servers failed. Re-run later to resume.`);
}
