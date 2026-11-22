/**
 * The team map's layers, drawn on top of the basemap: blocks coloured by lead rate, session paths
 * that fade with age, A/B leads, and the team's highlights and notes.
 */
import type { Highlight, MapBlocksRes, MapLeadsRes, TeamNote } from "@knockd/shared";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type * as maplibregl from "maplibre-gl";
import type { Theme } from "../theme";

export const COLOURS = {
  good: "#12a150",
  mid: "#f2c037",
  bad: "#e5484d",
  none: "#b9b8c3",
  path: "#2b2a3a",
  leadA: "#e8007f",
  leadB: "#7c4dff",
  note: "#15141f",
};

const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
const SOURCES = ["blocks", "paths", "leads", "highlights", "notes"] as const;
type SourceId = (typeof SOURCES)[number];

/** Colours that change with the basemap: dark lines on the light map, light lines on the dark one. */
const themed = (theme: Theme) =>
  theme === "dark"
    ? { path: "#f3f2f8", ring: "#1b1a22", noteFill: "#1b1a22", noteStroke: "#f3f2f8", blockOpacity: 0.45 }
    : { path: COLOURS.path, ring: "#ffffff", noteFill: "#ffffff", noteStroke: COLOURS.note, blockOpacity: 0.38 };

/** Adds the sources and layers (empty); `set*` functions below fill them. Re-run after the basemap reloads. */
export function addLayers(map: maplibregl.Map, theme: Theme) {
  const t = themed(theme);
  for (const id of SOURCES) if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: empty });

  map.addLayer({
    id: "blocks-fill",
    type: "fill",
    source: "blocks",
    paint: { "fill-color": ["get", "colour"], "fill-opacity": t.blockOpacity },
  });
  map.addLayer({
    id: "blocks-line",
    type: "line",
    source: "blocks",
    paint: { "line-color": ["get", "colour"], "line-width": 1, "line-opacity": 0.7 },
  });
  map.addLayer({
    id: "highlights-fill",
    type: "fill",
    source: "highlights",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": ["get", "colour"], "fill-opacity": 0.22 },
  });
  map.addLayer({
    id: "highlights-line",
    type: "line",
    source: "highlights",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "colour"],
      // Highlighter look: thick and translucent, so it doesn't blend into the block colours.
      "line-width": ["case", ["==", ["geometry-type"], "Polygon"], 5, 14],
      "line-opacity": 0.5,
    },
  });
  map.addLayer({
    id: "paths",
    type: "line",
    source: "paths",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": t.path,
      "line-width": ["get", "width"],
      "line-opacity": ["get", "opacity"],
    },
  });
  map.addLayer({
    id: "leads",
    type: "circle",
    source: "leads",
    paint: {
      "circle-radius": ["case", ["==", ["get", "grade"], "A"], 7, 5.5],
      "circle-color": ["case", ["==", ["get", "grade"], "A"], COLOURS.leadA, COLOURS.leadB],
      "circle-stroke-color": t.ring,
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "notes",
    type: "circle",
    source: "notes",
    paint: {
      "circle-radius": 8,
      "circle-color": t.noteFill,
      "circle-stroke-color": t.noteStroke,
      "circle-stroke-width": 3,
    },
  });
}

const fc = (features: Feature[]): FeatureCollection => ({ type: "FeatureCollection", features });
const setData = (map: maplibregl.Map, id: SourceId, data: FeatureCollection) =>
  (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data);

// ---------- Blocks ----------

/**
 * Blocks coloured by lead rate relative to each other: the weakest blocks red, the middle
 * yellow, the best green. Grey = not enough houses worked yet (the API returns rate null).
 */
export function setBlocks(map: maplibregl.Map, stats: MapBlocksRes["blocks"]) {
  const rates = stats.flatMap((b) => (b.rate === null ? [] : [b.rate])).sort((a, b) => a - b);
  const at = (q: number) => rates[Math.min(rates.length - 1, Math.floor(q * rates.length))] ?? 0;
  const [lo, mid, hi] = [at(0.1), at(0.5), at(0.9)];
  const colourOf = (rate: number | null) => {
    if (rate === null) return COLOURS.none;
    if (hi - lo < 1e-9) return COLOURS.mid;
    return rate <= mid
      ? mix(COLOURS.bad, COLOURS.mid, clamp01((rate - lo) / (mid - lo || 1)))
      : mix(COLOURS.mid, COLOURS.good, clamp01((rate - mid) / (hi - mid || 1)));
  };
  const features: Feature[] = stats.map(({ geometry, ...s }) => ({
    type: "Feature",
    geometry: geometry as Geometry,
    properties: { ...s, leads: JSON.stringify(s.leads), colour: colourOf(s.rate) },
  }));
  setData(map, "blocks", fc(features));
}

// ---------- Paths ----------

/**
 * Visibility = duration × age. A drive-by is barely there, ~30 minutes on a street is solid; paths
 * fade over the team's fade time, then stay just visible. Repeat visits stack because each
 * session's path is its own translucent line.
 */
export function setPaths(map: maplibregl.Map, paths: FeatureCollection, fadeDays: number, asOf: number) {
  const features = paths.features.map((f) => {
    const p = f.properties ?? {};
    const worked = p.classification === "worked";
    const duration = Math.min(1, Math.max(0.15, Number(p.durationS ?? 0) / 1800));
    const ageDays = Math.max(0, (asOf - Date.parse(String(p.workedAt))) / 86_400_000);
    const age = Math.max(0.12, 1 - ageDays / fadeDays);
    return {
      ...f,
      properties: { ...p, opacity: (worked ? 0.85 : 0.35) * duration * age, width: worked ? 4 : 2 },
    };
  });
  setData(map, "paths", fc(features));
}

// ---------- Leads, highlights, notes ----------

export function setLeads(map: maplibregl.Map, leads: MapLeadsRes["leads"]) {
  setData(
    map,
    "leads",
    fc(
      leads.map((l) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [l.lng, l.lat] },
        properties: { grade: l.grade, note: l.note ?? "", at: l.at },
      })),
    ),
  );
}

export function setHighlights(map: maplibregl.Map, highlights: Highlight[]) {
  setData(
    map,
    "highlights",
    fc(
      highlights.map((h) => ({
        type: "Feature",
        geometry: h.geometry as Geometry,
        properties: { id: h.id, colour: h.colour, by: h.createdBy.displayName, at: h.createdAt },
      })),
    ),
  );
}

export function setNotes(map: maplibregl.Map, notes: TeamNote[]) {
  setData(
    map,
    "notes",
    fc(
      notes.map((n) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [n.lng, n.lat] },
        properties: { id: n.id, text: n.text, by: n.createdBy.displayName, at: n.createdAt },
      })),
    ),
  );
}

// ---------- Colour helpers ----------

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa
    .map((v, i) =>
      Math.round(v + (pb[i]! - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
