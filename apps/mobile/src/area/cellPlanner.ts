/**
 * Which map cells to fetch next. A cell is wanted when any point of interest (the session centre or
 * a crew member) is within CELL_PREFETCH_RADIUS_M of it. Loaded and in-flight cells are never
 * requested again; failed cells wait RETRY_FAILED_CELL_MS before another try.
 */
import type { MultiPolygon, Polygon } from "geojson";
import { CELL_PREFETCH_RADIUS_M, cellsAround, type CellId, type LatLng } from "@knockd/shared";
import { bboxCentre } from "./features";

export const RETRY_FAILED_CELL_MS = 15_000;

export interface CellLoadState {
  readonly loaded: Readonly<Record<CellId, true>>;
  readonly inFlight: ReadonlySet<CellId>;
  /** cell id -> ms since epoch of the last failed attempt */
  readonly failedAt: Readonly<Record<CellId, number>>;
}

/** Centre (bounding-box) of the planned area as lat/lng. */
export function plannedAreaCentre(area: Polygon | MultiPolygon): LatLng | null {
  const rings = area.type === "Polygon" ? area.coordinates : area.coordinates.flat();
  const positions = rings.flat();
  if (positions.length === 0) return null;
  const [lng, lat] = bboxCentre(positions);
  return { lat, lng };
}

/** The session centre plus every member with a position. */
export function pointsOfInterest(
  plannedArea: Polygon | MultiPolygon | null,
  memberPositions: readonly (LatLng | null)[],
): LatLng[] {
  const centre = plannedArea ? plannedAreaCentre(plannedArea) : null;
  const members = memberPositions.filter((p): p is LatLng => p !== null);
  return centre ? [centre, ...members] : members;
}

export function wantedCells(points: readonly LatLng[], radiusM: number = CELL_PREFETCH_RADIUS_M): CellId[] {
  const seen = new Set<CellId>();
  for (const p of points) for (const id of cellsAround(p, radiusM)) seen.add(id);
  return [...seen];
}

export function cellsToLoad(
  points: readonly LatLng[],
  state: CellLoadState,
  nowMs: number,
  radiusM: number = CELL_PREFETCH_RADIUS_M,
): CellId[] {
  return wantedCells(points, radiusM).filter((id) => {
    if (state.loaded[id] || state.inFlight.has(id)) return false;
    const failed = state.failedAt[id];
    return failed === undefined || nowMs - failed >= RETRY_FAILED_CELL_MS;
  });
}
