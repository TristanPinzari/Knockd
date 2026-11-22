/**
 * Pure, immutable merge of GET /area and /layers responses into one area model. Streets and blocks
 * that cross a cell edge arrive in both cells, so everything is keyed (and deduped) by id.
 */
import type { FeatureCollection, Polygon } from "geojson";
import type { CellId, Grade, SessionAreaRes, SessionLayersRes } from "@knockd/shared";
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
}

export const EMPTY_AREA: AreaData = {
  loadedCells: {},
  blocks: {},
  houses: {},
  streets: {},
  housesGeoJSON: { type: "FeatureCollection", features: [] },
  pastLeads: {},
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
