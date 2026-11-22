/**
 * Area, plan and stats for the active session. Every write carries the session id it was fetched
 * for, so a late response from a previous session is ignored.
 */
import { create } from "zustand";
import type { MultiPolygon, Polygon } from "geojson";
import type { CellId, LatLng, PlanContent, SessionAreaRes, SessionLayersRes, SessionStatsRes } from "@knockd/shared";
import { EMPTY_AREA, mergeAreaCells, mergePastLeads, type AreaData } from "./areaModel";
import { plannedAreaCentre } from "./cellPlanner";
import { growRadiusM, MIN_AREA_RADIUS_M } from "./workingArea";

export interface AreaState {
  readonly sessionId: string | null;
  readonly area: AreaData;
  readonly inFlight: ReadonlySet<CellId>;
  readonly failedAt: Readonly<Record<CellId, number>>;
  readonly plannedArea: Polygon | MultiPolygon | null;
  /** The hidden working area's radius around the session centre; grows as the crew spreads out. */
  readonly areaRadiusM: number;
  /** Null until the first GET /plan answer. */
  readonly plan: PlanContent | null;
  readonly stats: SessionStatsRes | null;
  /** Latest user-facing error, cleared by the next success. */
  readonly error: string | null;
  start(sessionId: string): void;
  reset(): void;
  markInFlight(sessionId: string, cells: readonly CellId[]): void;
  cellsLoaded(sessionId: string, requested: readonly CellId[], res: SessionAreaRes): number;
  cellsFailed(sessionId: string, cells: readonly CellId[], nowMs: number, message: string): void;
  setLayers(sessionId: string, layers: SessionLayersRes): void;
  setPlannedArea(sessionId: string, area: Polygon | MultiPolygon): void;
  /** Grows the working area so it keeps its padding ahead of every point. */
  growArea(sessionId: string, points: readonly LatLng[]): void;
  setPlan(sessionId: string, plan: PlanContent): void;
  setStats(sessionId: string, stats: SessionStatsRes): void;
  setError(sessionId: string, message: string): void;
}

const initial = {
  sessionId: null,
  area: EMPTY_AREA,
  inFlight: new Set<CellId>(),
  failedAt: {},
  plannedArea: null,
  areaRadiusM: MIN_AREA_RADIUS_M,
  plan: null,
  stats: null,
  error: null,
};

function without(set: ReadonlySet<CellId>, cells: readonly CellId[]): ReadonlySet<CellId> {
  const drop = new Set(cells);
  return new Set([...set].filter((c) => !drop.has(c)));
}

function withoutKeys(
  rec: Readonly<Record<CellId, number>>,
  cells: readonly CellId[],
): Readonly<Record<CellId, number>> {
  const drop = new Set(cells);
  return Object.fromEntries(Object.entries(rec).filter(([k]) => !drop.has(k)));
}

function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export const useAreaStore = create<AreaState>()((set, get) => {
  /** Applies `update` only if the store still belongs to `sessionId`. */
  const forSession = (sessionId: string, update: (s: AreaState) => Partial<AreaState>): void =>
    set((s) => (s.sessionId === sessionId ? update(s) : s));

  return {
    ...initial,
    start: (sessionId) => {
      if (get().sessionId !== sessionId) set({ ...initial, inFlight: new Set(), sessionId });
    },
    reset: () => set({ ...initial, inFlight: new Set() }),
    markInFlight: (sessionId, cells) =>
      forSession(sessionId, (s) => ({ inFlight: new Set([...s.inFlight, ...cells]) })),
    cellsLoaded: (sessionId, requested, res) => {
      let skipped = 0;
      forSession(sessionId, (s) => {
        const merged = mergeAreaCells(s.area, res);
        skipped = merged.skipped;
        // Cells the server did not return still count as loaded (empty), so they are not refetched.
        const missing = requested.filter((c) => !merged.data.loadedCells[c]);
        const loadedCells = {
          ...merged.data.loadedCells,
          ...Object.fromEntries(missing.map((c) => [c, true as const])),
        };
        return {
          area: { ...merged.data, loadedCells },
          inFlight: without(s.inFlight, requested),
          failedAt: withoutKeys(s.failedAt, requested),
          error: null,
        };
      });
      return skipped;
    },
    cellsFailed: (sessionId, cells, nowMs, message) =>
      forSession(sessionId, (s) => ({
        inFlight: without(s.inFlight, cells),
        failedAt: { ...s.failedAt, ...Object.fromEntries(cells.map((c) => [c, nowMs])) },
        error: message,
      })),
    setLayers: (sessionId, layers) => forSession(sessionId, (s) => ({ area: mergePastLeads(s.area, layers) })),
    setPlannedArea: (sessionId, plannedArea) => forSession(sessionId, () => ({ plannedArea })),
    growArea: (sessionId, points) =>
      forSession(sessionId, (s) => {
        const centre = s.plannedArea ? plannedAreaCentre(s.plannedArea) : null;
        if (!centre) return s;
        const areaRadiusM = growRadiusM(centre, s.areaRadiusM, points);
        return areaRadiusM === s.areaRadiusM ? s : { areaRadiusM };
      }),
    // Polls return equal data most of the time: keep the old object so map memos stay stable.
    setPlan: (sessionId, plan) =>
      forSession(sessionId, (s) => ({ plan: sameJson(s.plan, plan) ? s.plan : plan, error: null })),
    setStats: (sessionId, stats) =>
      forSession(sessionId, (s) => ({ stats: sameJson(s.stats, stats) ? s.stats : stats, error: null })),
    setError: (sessionId, error) => forSession(sessionId, () => ({ error })),
  };
});
