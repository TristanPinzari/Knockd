import type { FeatureCollection, LineString } from "geojson";
import { create } from "zustand";
import { trailToGeoJSON, type TrailMode, type TrailPoint, type TrailsRes } from "@knockd/shared";
import { mergePoints, tupleToPoint } from "./mergePoints";

export type TrailFeatureCollection = FeatureCollection<LineString, { memberId: string; mode: TrailMode }>;

/** A live position as it arrives from the socket, with t already in ms. */
export interface TimedPosition {
  memberId: string;
  t: number;
  lat: number;
  lng: number;
}

const EMPTY: TrailFeatureCollection = { type: "FeatureCollection", features: [] };

interface TrailsState {
  pointsByMember: Readonly<Record<string, readonly TrailPoint[]>>;
  /** Per-member GeoJSON, recomputed only for members whose points changed. */
  geoByMember: Readonly<Record<string, TrailFeatureCollection>>;
  /** Everyone's trails in one collection for the map. Same reference until something changes. */
  trailsGeoJSON: TrailFeatureCollection;
  /** Newest point time across all members (ms), used for `GET /trails?since=`. */
  lastPointT: number | null;
  /** Replace everything with the full GET /trails result. */
  setFromResponse: (trails: TrailsRes["trails"]) => void;
  /** Add the points of a `?since=` catch-up fetch. */
  mergeFromResponse: (trails: TrailsRes["trails"]) => void;
  appendPositions: (positions: readonly TimedPosition[]) => void;
  reset: () => void;
}

function computeGeo(memberId: string, points: readonly TrailPoint[]): TrailFeatureCollection {
  return trailToGeoJSON(memberId, [...points]) as TrailFeatureCollection;
}

function combine(geoByMember: Readonly<Record<string, TrailFeatureCollection>>): TrailFeatureCollection {
  const features = Object.keys(geoByMember)
    .sort()
    .flatMap((id) => geoByMember[id]!.features);
  return features.length === 0 ? EMPTY : { type: "FeatureCollection", features };
}

function maxT(pointsByMember: Readonly<Record<string, readonly TrailPoint[]>>): number | null {
  let max: number | null = null;
  for (const points of Object.values(pointsByMember)) {
    const last = points[points.length - 1];
    if (last && (max === null || last.t > max)) max = last.t;
  }
  return max;
}

/** Applies incoming points per member, recomputing GeoJSON only for members that actually changed. */
export function applyIncoming(
  state: Pick<TrailsState, "pointsByMember" | "geoByMember" | "trailsGeoJSON" | "lastPointT">,
  incoming: Readonly<Record<string, readonly TrailPoint[]>>,
): Pick<TrailsState, "pointsByMember" | "geoByMember" | "trailsGeoJSON" | "lastPointT"> {
  const pointsByMember = { ...state.pointsByMember };
  const geoByMember = { ...state.geoByMember };
  let changed = false;
  for (const [memberId, points] of Object.entries(incoming)) {
    const before = state.pointsByMember[memberId] ?? [];
    const merged = mergePoints(before, points);
    if (merged === before) continue;
    changed = true;
    pointsByMember[memberId] = merged;
    geoByMember[memberId] = computeGeo(memberId, merged);
  }
  if (!changed) return state;
  return { pointsByMember, geoByMember, trailsGeoJSON: combine(geoByMember), lastPointT: maxT(pointsByMember) };
}

const initial = {
  pointsByMember: {} as Readonly<Record<string, readonly TrailPoint[]>>,
  geoByMember: {} as Readonly<Record<string, TrailFeatureCollection>>,
  trailsGeoJSON: EMPTY,
  lastPointT: null as number | null,
};

function groupResponse(trails: TrailsRes["trails"]): Record<string, readonly TrailPoint[]> {
  return Object.fromEntries(trails.map((t) => [t.memberId, t.points.map(tupleToPoint)]));
}

export const useTrailsStore = create<TrailsState>()((set) => ({
  ...initial,
  setFromResponse: (trails) => set((s) => applyIncoming({ ...s, ...initial }, groupResponse(trails))),
  mergeFromResponse: (trails) => set((s) => applyIncoming(s, groupResponse(trails))),
  appendPositions: (positions) =>
    set((s) => {
      const grouped: Record<string, TrailPoint[]> = {};
      for (const p of positions) {
        grouped[p.memberId] = [...(grouped[p.memberId] ?? []), { t: p.t, lat: p.lat, lng: p.lng }];
      }
      return applyIncoming(s, grouped);
    }),
  reset: () => set({ ...initial }),
}));
