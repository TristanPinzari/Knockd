/**
 * Mounts the realtime side of the active session: the socket (which keeps the crew/trails/leads
 * stores live), my member id, and location tracking. Renders nothing extra when there is no
 * session. Screens show the location notice themselves (LocationNoticeBanner).
 */
import { router } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { Alert } from "react-native";
import { startTracking } from "../location";
import { useMyLocationStore } from "../location/myLocationStore";
import { useOfflineArea } from "../map/useOfflineArea";
import { logger } from "../realtime/logger";
import { useCrewStore } from "../realtime/stores/crewStore";
import { useSessionStore } from "../realtime/stores/sessionStore";
import { useSessionSocket } from "../realtime/useSessionSocket";
import { useSessionUi } from "./uiStore";
import { useActiveSession, type ActiveSession } from "./activeSessionStore";
import { sessionLifecycle } from "./defaultDeps";

function useTracking(active: ActiveSession | null): void {
  const sessionId = active?.sessionId ?? null;
  const token = active?.token ?? null;
  const mode = useSessionUi((s) => (s.batterySaver ? "saver" : "standard"));
  // Restarts tracking (cleanly) when battery saver is switched.
  useEffect(() => {
    if (!sessionId || !token) return;
    startTracking(sessionId, token, mode).catch((error: unknown) => {
      logger.error("session: could not start tracking", error);
      useMyLocationStore.getState().setError("Could not start tracking");
    });
  }, [sessionId, token, mode]);
}

/** Members' phones learn the session ended from the socket: clean up and show the summary. */
function useEndedWatcher(active: ActiveSession | null): void {
  const status = useSessionStore((s) => s.status);
  useEffect(() => {
    if (!active || status === "live") return;
    void sessionLifecycle.teardown({ ended: true }).then(() => router.replace("/end"));
  }, [active, status]);
}

/** The admin removed me: leave the session on this phone and say so. */
function useRemovedWatcher(active: ActiveSession | null): void {
  const removed = useCrewStore((s) => s.removedMe);
  useEffect(() => {
    if (!active || !removed) return;
    void sessionLifecycle.teardown().then(() => {
      router.replace("/");
      Alert.alert("Removed from the session", "The host removed you. Ask them for the code to join again.");
    });
  }, [active, removed]);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const active = useActiveSession((s) => s.active);
  useSessionSocket(active?.token ?? null);
  const memberId = active?.memberId ?? null;
  useEffect(() => {
    if (!memberId) return;
    useCrewStore.getState().setMe(memberId);
    useSessionUi.getState().setSessionLive(true);
  }, [memberId]);
  useTracking(active);
  useOfflineArea(active?.sessionId ?? null);
  useEndedWatcher(active);
  useRemovedWatcher(active);

  return <>{children}</>;
}
