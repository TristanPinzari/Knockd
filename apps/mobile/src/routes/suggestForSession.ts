/**
 * Runs Suggest (`suggestRoutes` from @knockd/shared) for a live session: every loaded house inside
 * the planned area is a door to knock, every loaded street can be walked, and the whole crew is
 * planned for. Picking an option is then `suggestionToPlanOps` + `plan:edit` (see planEdits).
 */
import type { MultiPolygon, Polygon, Position } from "geojson";
import { DEFAULT_SECONDS_PER_DOOR, suggestRoutes, type LatLng, type SuggestResult } from "@knockd/shared";

export interface SuggestHouseInfo {
  readonly houseId: string;
  readonly blockId: string;
  readonly streetId: string | null;
  /** [lng, lat] */
  readonly centre: readonly [number, number];
}

export interface SuggestStreetInfo {
  readonly streetId: string;
  readonly line: { readonly coordinates: readonly Position[] };
}

export interface SuggestForSessionInput {
  readonly houses: Readonly<Record<string, SuggestHouseInfo>>;
  readonly streets: Readonly<Record<string, SuggestStreetInfo>>;
  /** Houses inside it are selected; null selects every loaded house. Ignored when selectedHouseIds is set. */
  readonly plannedArea: Polygon | MultiPolygon | null;
  /** The houses the crew picked with the brush (they must all be visited). */
  readonly selectedHouseIds?: ReadonlySet<string>;
  readonly memberIds: readonly string[];
  /** Where the crew starts (the car). */
  readonly start: LatLng;
  /** Optional regroup pin. */
  readonly regroup?: LatLng | null;
  readonly secondsPerDoor?: number;
}

/** Ray casting on one ring ([lng, lat] positions). */
function inRing(ring: readonly Position[], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = [ring[i]![0]!, ring[i]![1]!];
    const [xj, yj] = [ring[j]![0]!, ring[j]![1]!];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring of any polygon and outside its holes. */
export function inArea(area: Polygon | MultiPolygon, [lng, lat]: readonly [number, number]): boolean {
  const polygons = area.type === "Polygon" ? [area.coordinates] : area.coordinates;
  return polygons.some(
    ([outer, ...holes]) => outer !== undefined && inRing(outer, lng, lat) && !holes.some((h) => inRing(h, lng, lat)),
  );
}

const toId = (id: string): number | null => (Number.isFinite(Number(id)) ? Number(id) : null);

/** Null when there's nothing to plan (no crew or no houses loaded inside the area). */
export function suggestForSession(input: SuggestForSessionInput): SuggestResult | null {
  const picked = input.selectedHouseIds;
  const houses = Object.values(input.houses).filter((h) =>
    picked ? picked.has(h.houseId) : !input.plannedArea || inArea(input.plannedArea, h.centre),
  );
  if (houses.length === 0 || input.memberIds.length === 0) return null;
  return suggestRoutes({
    streets: Object.values(input.streets).flatMap((s) => {
      const id = toId(s.streetId);
      return id === null
        ? []
        : [{ id, coordinates: s.line.coordinates.map((p) => [p[0]!, p[1]!] as [number, number]) }];
    }),
    houses: houses.flatMap((h) => {
      const id = toId(h.houseId);
      return id === null
        ? []
        : [
            {
              id,
              lat: h.centre[1],
              lng: h.centre[0],
              streetId: h.streetId === null ? null : toId(h.streetId),
              blockId: toId(h.blockId),
            },
          ];
    }),
    memberIds: [...input.memberIds],
    start: input.start,
    regroup: input.regroup ?? null,
    secondsPerDoor: input.secondsPerDoor ?? DEFAULT_SECONDS_PER_DOOR,
  });
}
