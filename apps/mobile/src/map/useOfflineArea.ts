/**
 * Keeps the session area's map downloaded for offline use (README "Offline"): once the session
 * centre is known, and again (bigger) whenever the working area grows. Waits a few seconds after a
 * change so a growing area doesn't start a download per step.
 */
import { useEffect } from "react";
import { create } from "zustand";
import { useAreaStore } from "../area/areaStore";
import { plannedAreaCentre } from "../area/cellPlanner";
import { logger } from "../realtime/logger";
import { ensureSessionPack } from "./offline";
import { styleUrl } from "./useKnockdStyle";

export const OFFLINE_SETTLE_MS = 5000;

export interface OfflineMapState {
  readonly status: "idle" | "downloading" | "ready" | "failed";
  readonly percentage: number;
  set(patch: Partial<Pick<OfflineMapState, "status" | "percentage">>): void;
}

export const useOfflineMap = create<OfflineMapState>()((set) => ({
  status: "idle",
  percentage: 0,
  set: (patch) => set(patch),
}));

export function useOfflineArea(sessionId: string | null): void {
  const planned = useAreaStore((s) => s.plannedArea);
  const radiusM = useAreaStore((s) => s.areaRadiusM);
  const centre = planned ? plannedAreaCentre(planned) : null;
  const lat = centre?.lat ?? null;
  const lng = centre?.lng ?? null;

  useEffect(() => {
    if (!sessionId || lat === null || lng === null) {
      useOfflineMap.getState().set({ status: "idle", percentage: 0 });
      return undefined;
    }
    const timer = setTimeout(() => {
      const offline = useOfflineMap.getState();
      void ensureSessionPack({
        sessionId,
        centre: { lat, lng },
        radiusM,
        styleUrl: styleUrl(),
        onProgress: (p) =>
          offline.set({ status: p.state === "complete" ? "ready" : "downloading", percentage: p.percentage }),
        onError: (message) => {
          logger.warn("offline map: download failed", message);
          offline.set({ status: "failed" });
        },
      }).catch((error: unknown) => {
        logger.warn("offline map: could not start the download", error);
        offline.set({ status: "failed" });
      });
    }, OFFLINE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [sessionId, lat, lng, radiusM]);
}
