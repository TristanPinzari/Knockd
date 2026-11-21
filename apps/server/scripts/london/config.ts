import { fileURLToPath } from "node:url";
import path from "node:path";

/** London, Ontario (city limits plus a margin). Overpass order: south, west, north, east. */
export const LONDON_BBOX = { south: 42.82, west: -81.42, north: 43.1, east: -81.05 } as const;

export const DATA_DIR = fileURLToPath(new URL("../../data/osm/", import.meta.url));
export const ROADS_FILE = path.join(DATA_DIR, "london-roads.json");
export const BUILDINGS_FILE = path.join(DATA_DIR, "london-buildings.json");

/** Public Overpass servers, tried in order. They're shared and sometimes overloaded (504/429). */
export const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/** Overpass `out geom` element for a way. */
export interface OverpassWay {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}
