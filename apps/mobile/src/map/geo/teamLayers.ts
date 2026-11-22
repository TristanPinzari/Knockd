/**
 * A loaded team map on the phone (README "Loading team data into a session"), drawn the way the
 * web's team map draws it:
 *   coverage    past paths; visibility = duration × age, fading over the team's fade time
 *   leadRate    blocks coloured against each other: weakest red, middle yellow, best green
 *   highlights  the web's highlighter strokes and loops
 *   notes       the web's notes
 */
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { TeamLayerData } from "@/area/areaModel";
import type { Layer } from "@knockd/shared";

/** The server's default fade time (a team can change it on the web). */
export const DEFAULT_FADE_DAYS = 120;

const BAD = "#EF4444";
const MID = "#FACC15";
const GOOD = "#22C55E";
const NONE = "#9AA3AD";

export interface TeamLayersGeo {
  readonly coverage: FeatureCollection<LineString, { opacity: number; width: number }>;
  readonly leadRate: FeatureCollection<Polygon, { colour: string }>;
  readonly highlightLines: FeatureCollection<LineString, { colour: string }>;
  readonly highlightAreas: FeatureCollection<Polygon, { colour: string }>;
  readonly notes: FeatureCollection<Point, { text: string }>;
}

const fc = <G extends LineString | Polygon | Point, P>(features: Feature<G, P>[]): FeatureCollection<G, P> => ({
  type: "FeatureCollection",
  features,
});

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const [x, y] = [hex(a), hex(b)];
  return `#${x
    .map((v, i) =>
      Math.round(v + (y[i]! - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Colours relative to the loaded blocks (real lead rates are a few %, so fixed cut-offs would paint all red). */
export function rateColours(rates: readonly (number | null)[]): (rate: number | null) => string {
  const known = rates.filter((r): r is number => r !== null).sort((a, b) => a - b);
  const at = (q: number) => known[Math.min(known.length - 1, Math.floor(q * known.length))] ?? 0;
  const [lo, mid, hi] = [at(0.1), at(0.5), at(0.9)];
  return (rate) => {
    if (rate === null) return NONE;
    if (hi - lo < 1e-9) return MID;
    return rate <= mid
      ? mix(BAD, MID, clamp01((rate - lo) / (mid - lo || 1)))
      : mix(MID, GOOD, clamp01((rate - mid) / (hi - mid || 1)));
  };
}

/** Same formula as the web: long, recent visits are strong; drive-bys and old visits faint. */
export function pathOpacity(props: Record<string, unknown>, nowMs: number, fadeDays = DEFAULT_FADE_DAYS): number {
  const worked = props.classification === "worked";
  const duration = Math.min(1, Math.max(0.15, Number(props.durationS ?? 0) / 1800));
  const ageDays = Math.max(0, (nowMs - Date.parse(String(props.workedAt))) / 86_400_000);
  const age = Math.max(0.12, 1 - ageDays / fadeDays);
  return (worked ? 0.85 : 0.35) * duration * (Number.isFinite(age) ? age : 0.12);
}

export function buildTeamLayersGeo(
  team: TeamLayerData,
  blocks: Readonly<Record<string, { readonly polygon: Polygon }>>,
  shown: ReadonlySet<Layer>,
  nowMs: number,
): TeamLayersGeo {
  const coverage = shown.has("coverage")
    ? Object.values(team.coverage).map((f) => ({
        type: "Feature" as const,
        geometry: f.geometry,
        properties: {
          opacity: pathOpacity(f.properties ?? {}, nowMs),
          width: f.properties?.classification === "worked" ? 4 : 2,
        },
      }))
    : [];

  const rates = Object.entries(team.leadRate);
  const colourOf = rateColours(rates.map(([, r]) => r.rate));
  const leadRate = shown.has("leadRate")
    ? rates.flatMap(([blockId, r]) => {
        const block = blocks[blockId];
        return block
          ? [{ type: "Feature" as const, geometry: block.polygon, properties: { colour: colourOf(r.rate) } }]
          : [];
      })
    : [];

  const highlights = shown.has("highlights") ? Object.values(team.highlights) : [];
  const highlightLines = highlights.flatMap((h) =>
    h.geometry.type === "LineString"
      ? [{ type: "Feature" as const, geometry: h.geometry, properties: { colour: h.colour } }]
      : [],
  );
  const highlightAreas = highlights.flatMap((h) =>
    h.geometry.type === "Polygon"
      ? [{ type: "Feature" as const, geometry: h.geometry, properties: { colour: h.colour } }]
      : [],
  );

  const notes = shown.has("notes")
    ? Object.values(team.notes).map((n) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [n.lng, n.lat] },
        properties: { text: n.text },
      }))
    : [];

  return {
    coverage: fc(coverage),
    leadRate: fc(leadRate),
    highlightLines: fc(highlightLines),
    highlightAreas: fc(highlightAreas),
    notes: fc(notes),
  };
}

export const EMPTY_TEAM_GEO: TeamLayersGeo = buildTeamLayersGeo(
  { coverage: {}, leadRate: {}, highlights: {}, notes: {} },
  {},
  new Set(),
  0,
);
