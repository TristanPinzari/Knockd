/**
 * Pure, immutable merge of GET /area and /layers responses into one area model. Streets and blocks
 * that cross a cell edge arrive in both cells, so everything is keyed (and deduped) by id.
 */
import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";
import type { CellId, Grade, Highlight, SessionAreaRes, SessionLayersRes, TeamNote } from "@knockd/shared";
import { parseBlocks, parseHouses, parseStreets, type BlockInfo, type HouseInfo, type StreetInfo } from "./features";

export interface PastLeadInfo {
  readonly houseId: string;
  readonly grade: Grade;
  /** ISO timestamp of the last update. */
  readonly at: string;
}

export type HouseCollection = FeatureCollection<Polygon, { houseId: string; blockId: string }>;

export interface AreaData {
  readonly loadedCells: Readonly<Record<CellId, true>>;
  readonly blocks: Readonly<Record<string, BlockInfo>>;
  readonly houses: Readonly<Record<string, HouseInfo>>;
  readonly streets: Readonly<Record<string, StreetInfo>>;
  /** Every loaded house, ready for the map. A new object only when houses were added. */
  readonly housesGeoJSON: HouseCollection;
  readonly pastLeads: Readonly<Record<string, PastLeadInfo>>;
  /** The rest of a loaded team map (GET /layers), merged across cells. */
  readonly team: TeamLayerData;
}

export interface TeamLayerData {
  /** Past paths, keyed so a street that spans two cells is kept once. */
  readonly coverage: Readonly<Record<string, Feature<LineString>>>;
  readonly leadRate: Readonly<Record<string, { readonly rate: number | null; readonly housesWorked: number }>>;
  readonly highlights: Readonly<Record<string, Highlight>>;
  readonly notes: Readonly<Record<string, TeamNote>>;
}

export const EMPTY_TEAM_LAYERS: TeamLayerData = { coverage: {}, leadRate: {}, highlights: {}, notes: {} };

export const EMPTY_AREA: AreaData = {
  loadedCells: {},
  blocks: {},
  houses: {},
  streets: {},
  housesGeoJSON: { type: "FeatureCollection", features: [] },
  pastLeads: {},
  team: EMPTY_TEAM_LAYERS,
};

export interface MergeResult {
  readonly data: AreaData;
  /** Features that failed validation and were dropped. */
  readonly skipped: number;
}

function addNew<T>(
  current: Readonly<Record<string, T>>,
  items: readonly T[],
  key: (t: T) => string,
): Readonly<Record<string, T>> {
  const fresh = items.filter((t) => !(key(t) in current));
  if (fresh.length === 0) return current;
  return { ...current, ...Object.fromEntries(fresh.map((t) => [key(t), t])) };
}

export function mergeAreaCells(data: AreaData, res: SessionAreaRes): MergeResult {
  let skipped = 0;
  const blocks: BlockInfo[] = [];
  const houses: HouseInfo[] = [];
  const streets: StreetInfo[] = [];
  for (const cell of res.cells) {
    const b = parseBlocks(cell.blocks.features);
    const h = parseHouses(cell.houses.features);
    const s = parseStreets(cell.streets.features);
    blocks.push(...b.items);
    houses.push(...h.items);
    streets.push(...s.items);
    skipped += b.skipped + h.skipped + s.skipped;
  }
  const nextHouses = addNew(data.houses, houses, (h) => h.houseId);
  const housesGeoJSON: HouseCollection =
    nextHouses === data.houses
      ? data.housesGeoJSON
      : { type: "FeatureCollection", features: Object.values(nextHouses).map((h) => h.feature) };
  return {
    skipped,
    data: {
      ...data,
      loadedCells: { ...data.loadedCells, ...Object.fromEntries(res.cells.map((c) => [c.id, true as const])) },
      blocks: addNew(data.blocks, blocks, (b) => b.blockId),
      houses: nextHouses,
      streets: addNew(data.streets, streets, (s) => s.streetId),
      housesGeoJSON,
    },
  };
}

/** Keeps the latest past lead per house. */
/** Coverage, lead rates, highlights and team notes from GET /layers, added to what we have. */
export function mergeTeamLayers(data: AreaData, layers: SessionLayersRes): AreaData {
  const { coverage, leadRate, highlights, notes } = layers;
  if (!coverage?.features.length && !leadRate?.length && !highlights?.length && !notes?.length) return data;
  const team = data.team;
  const paths = { ...team.coverage };
  for (const f of coverage?.features ?? []) {
    if (f.geometry?.type !== "LineString") continue;
    const p = f.properties ?? {};
    paths[`${String(p.sessionId)}:${String(p.memberName)}:${String(p.streetId)}`] = f as Feature<LineString>;
  }
  return {
    ...data,
    team: {
      coverage: paths,
      leadRate: {
        ...team.leadRate,
        ...Object.fromEntries(
          (leadRate ?? []).map((b) => [String(b.blockId), { rate: b.rate, housesWorked: b.housesWorked }]),
        ),
      },
      highlights: { ...team.highlights, ...Object.fromEntries((highlights ?? []).map((h) => [h.id, h])) },
      notes: { ...team.notes, ...Object.fromEntries((notes ?? []).map((n) => [n.id, n])) },
    },
  };
}

export function mergePastLeads(data: AreaData, layers: SessionLayersRes): AreaData {
  const incoming = layers.leads ?? [];
  if (incoming.length === 0) return data;
  const next: Record<string, PastLeadInfo> = { ...data.pastLeads };
  for (const l of incoming) {
    const houseId = String(l.houseId);
    const known = next[houseId];
    if (!known || Date.parse(l.at) > Date.parse(known.at)) next[houseId] = { houseId, grade: l.grade, at: l.at };
  }
  return { ...data, pastLeads: next };
}
