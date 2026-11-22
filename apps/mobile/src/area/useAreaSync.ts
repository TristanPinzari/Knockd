/**
 * Keeps the area store in sync with the active session: the session centre, the hidden working area
 * (it grows as anyone walks into its padding, see workingArea.ts) and its cells, cells around every
 * crew member, the live plan and stats every 30 s, and
 * stats again whenever the number of leads changes (`lead:new` lands in useLeadsStore).
 *
 * The live plan comes from the versioned plan store (socket `plan:updated` + snapshot); GET /plan
 * feeds the same store every 30 s and whenever an update was missed, and the store is mirrored here.
 * TODO(layers): team `highlights` and `notes` from /layers are read-only and not drawn yet.
 */
import { useEffect } from "react";
import type { LatLng } from "@knockd/shared";
import { getApiUrl } from "../realtime/config";
import { logger } from "../realtime/logger";
import { useCrewStore } from "../realtime/stores/crewStore";
import { useLeadsStore } from "../realtime/stores/leadsStore";
import { usePlanStore } from "../realtime/stores/planStore";
import type { ActiveSession } from "../session";
import { useTrailsStore } from "../trails";
import { createAreaApi } from "./areaApi";
import { createAreaLoader, type AreaLoader } from "./areaLoader";
import { useAreaStore } from "./areaStore";
import { plannedAreaCentre, pointsOfInterest } from "./cellPlanner";

export const PLAN_STATS_POLL_MS = 30_000;

function createLoaderFor(active: ActiveSession): AreaLoader | null {
  try {
    const api = createAreaApi({ baseUrl: getApiUrl() });
    return createAreaLoader({
      api,
      sessionId: active.sessionId,
      token: active.token,
      onPlan: (plan, version) => usePlanStore.getState().setPlan(plan, version),
    });
  } catch (error) {
    logger.warn("area: could not create the API client", error);
    useAreaStore.getState().setError(active.sessionId, "The app isn't configured to reach the server.");
    return null;
  }
}

function crewPositions(): (LatLng | null)[] {
  return Object.values(useCrewStore.getState().members).map((m) => m.position);
}

/** Everywhere the crew is or has been: live positions plus every trail point. */
function crewFootprint(): LatLng[] {
  const live = crewPositions().filter((p): p is LatLng => p !== null);
  const trails = Object.values(useTrailsStore.getState().pointsByMember).flat();
  return [...live, ...trails];
}

export function useAreaSync(active: ActiveSession | null): void {
  const sessionId = active?.sessionId ?? null;
  const token = active?.token ?? null;

  useEffect(() => {
    if (!active) {
      useAreaStore.getState().reset();
      return undefined;
    }
    useAreaStore.getState().start(active.sessionId);
    const loader = createLoaderFor(active);
    if (!loader) return undefined;

    /** Grows the working area to the crew's footprint, then loads its cells and the cells around everyone. */
    const loadNearby = (): void => {
      const store = useAreaStore.getState();
      store.growArea(active.sessionId, crewFootprint());
      const { plannedArea, areaRadiusM } = useAreaStore.getState();
      const centre = plannedArea ? plannedAreaCentre(plannedArea) : null;
      if (centre) void loader.ensureCells([centre], areaRadiusM);
      void loader.ensureCells(pointsOfInterest(null, crewPositions()));
    };
    const refresh = (): void => {
      void loader.refreshPlan();
      void loader.refreshStats();
    };

    void loader.loadSessionInfo().then(loadNearby);
    loadNearby();
    refresh();
    const timer = setInterval(refresh, PLAN_STATS_POLL_MS);
    const stopCrew = useCrewStore.subscribe((s, prev) => {
      if (s.members !== prev.members) loadNearby();
    });
    const stopTrails = useTrailsStore.subscribe((s, prev) => {
      if (s.pointsByMember !== prev.pointsByMember) loadNearby();
    });
    const stopLeads = useLeadsStore.subscribe((s, prev) => {
      if (Object.keys(s.leads).length !== Object.keys(prev.leads).length) void loader.refreshStats();
    });
    const mirrorPlan = (plan: ReturnType<typeof usePlanStore.getState>["plan"]): void => {
      if (plan) useAreaStore.getState().setPlan(active.sessionId, plan);
    };
    mirrorPlan(usePlanStore.getState().plan);
    const stopPlan = usePlanStore.subscribe((s, prev) => {
      if (s.plan !== prev.plan) mirrorPlan(s.plan);
      if (s.needsRefetch && !prev.needsRefetch) void loader.refreshPlan();
    });

    return () => {
      clearInterval(timer);
      stopCrew();
      stopTrails();
      stopLeads();
      stopPlan();
    };
    // Re-run only when the session identity changes, not on every store update of `active`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token]);
}
