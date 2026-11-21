import { z } from "zod";
import type { LatLng } from "./common";

/**
 * Map cells: a fixed grid of 0.01° × 0.01° cells (~1.1 km × ~0.8 km around London, ON).
 * Session areas grow by loading cells. Server and clients compute IDs the same way.
 */
export const CELL_SIZE_DEG = 0.01;

/** Load a cell when any crew member is within this distance of it. */
export const CELL_PREFETCH_RADIUS_M = 500;

export const CellId = z.string().regex(/^-?\d+_-?\d+$/, "Invalid cell id");
export type CellId = z.infer<typeof CellId>;

export function cellIdFor({ lat, lng }: LatLng): CellId {
  return `${Math.floor(lat / CELL_SIZE_DEG)}_${Math.floor(lng / CELL_SIZE_DEG)}`;
}

export function cellBounds(id: CellId): { minLat: number; minLng: number; maxLat: number; maxLng: number } {
  const [latIdx, lngIdx] = id.split("_").map(Number) as [number, number];
  return {
    minLat: latIdx * CELL_SIZE_DEG,
    minLng: lngIdx * CELL_SIZE_DEG,
    maxLat: (latIdx + 1) * CELL_SIZE_DEG,
    maxLng: (lngIdx + 1) * CELL_SIZE_DEG,
  };
}

/** Every cell that overlaps a square of ±radiusM around a point. */
export function cellsAround(point: LatLng, radiusM: number = CELL_PREFETCH_RADIUS_M): CellId[] {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((point.lat * Math.PI) / 180));
  const minLat = Math.floor((point.lat - dLat) / CELL_SIZE_DEG);
  const maxLat = Math.floor((point.lat + dLat) / CELL_SIZE_DEG);
  const minLng = Math.floor((point.lng - dLng) / CELL_SIZE_DEG);
  const maxLng = Math.floor((point.lng + dLng) / CELL_SIZE_DEG);
  const ids: CellId[] = [];
  for (let a = minLat; a <= maxLat; a++) for (let b = minLng; b <= maxLng; b++) ids.push(`${a}_${b}`);
  return ids;
}
