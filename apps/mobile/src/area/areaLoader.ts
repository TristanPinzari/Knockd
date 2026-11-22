/**
 * Fetches area cells, layers, plan and stats for one session into the area store. In-flight cells are
 * deduped through the store, loaded cells are never refetched, and failures are recorded with a
 * user-friendly message (and retried later by the next `ensureCells` call).
 */
import type { CellId, LatLng, PlanContent } from "@knockd/shared";
import { logger } from "../realtime/logger";
import { chunkCells, type AreaApi } from "./areaApi";
import { useAreaStore, type AreaState } from "./areaStore";
import { cellsToLoad } from "./cellPlanner";
import { friendlyAreaError } from "./errors";

export interface AreaStoreLike {
  getState(): AreaState;
}

export interface AreaLoaderDeps {
  readonly api: AreaApi;
  readonly sessionId: string;
  readonly token: string;
  readonly store?: AreaStoreLike;
  readonly now?: () => number;
  /** Where a fetched plan goes (with its version). Defaults to the area store, unversioned. */
  readonly onPlan?: (plan: PlanContent, version: number) => void;
}

export interface AreaLoader {
  loadSessionInfo(): Promise<void>;
  /** Loads every unloaded cell within `radiusM` of the points. Resolves when all started requests settle. */
  ensureCells(points: readonly LatLng[], radiusM?: number): Promise<void>;
  refreshPlan(): Promise<void>;
  refreshStats(): Promise<void>;
}

export function createAreaLoader(deps: AreaLoaderDeps): AreaLoader {
  const { api, sessionId, token } = deps;
  const store = deps.store ?? useAreaStore;
  const now = deps.now ?? Date.now;

  const fail = (what: string, error: unknown): void => {
    logger.warn(`area: ${what} failed`, error);
    store.getState().setError(sessionId, friendlyAreaError(error));
  };

  const loadLayers = async (cells: readonly CellId[]): Promise<void> => {
    try {
      store.getState().setLayers(sessionId, await api.getLayers(sessionId, token, cells));
    } catch (error) {
      // Layers are optional reference data: log only, never block the map.
      logger.warn("area: layers failed", error);
    }
  };

  const loadChunk = async (cells: readonly CellId[]): Promise<void> => {
    try {
      const res = await api.getArea(sessionId, token, cells);
      const skipped = store.getState().cellsLoaded(sessionId, cells, res);
      if (skipped > 0) logger.warn(`area: skipped ${skipped} malformed features`);
    } catch (error) {
      logger.warn("area: cells failed", error);
      store.getState().cellsFailed(sessionId, cells, now(), friendlyAreaError(error));
      return;
    }
    await loadLayers(cells);
  };

  return {
    loadSessionInfo: async () => {
      try {
        const info = await api.getSessionInfo(sessionId, token);
        store.getState().setPlannedArea(sessionId, info.plannedArea);
      } catch (error) {
        fail("session info", error);
      }
    },
    ensureCells: async (points, radiusM) => {
      const state = store.getState();
      const loadState = { loaded: state.area.loadedCells, inFlight: state.inFlight, failedAt: state.failedAt };
      const cells = cellsToLoad(points, loadState, now(), radiusM);
      if (cells.length === 0) return;
      state.markInFlight(sessionId, cells);
      await Promise.all(chunkCells(cells).map(loadChunk));
    },
    refreshPlan: async () => {
      try {
        const res = await api.getPlan(sessionId, token);
        if (deps.onPlan) deps.onPlan(res.plan, res.version);
        else store.getState().setPlan(sessionId, res.plan);
      } catch (error) {
        fail("plan", error);
      }
    },
    refreshStats: async () => {
      try {
        store.getState().setStats(sessionId, await api.getStats(sessionId, token));
      } catch (error) {
        fail("stats", error);
      }
    },
  };
}
