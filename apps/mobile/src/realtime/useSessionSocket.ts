import { useEffect } from "react";
import { io } from "socket.io-client";
import { useTrailsStore } from "../trails/trailsStore";
import { getApiUrl } from "./config";
import { logger } from "./logger";
import { startOvertakeWatcher } from "./overtake";
import { getRuntime } from "./runtime";
import { decodeSessionClaims } from "./sessionToken";
import { useChatStore } from "./stores/chatStore";
import { useCrewStore } from "./stores/crewStore";
import { useLeadsStore } from "./stores/leadsStore";
import { useOvertakeStore } from "./stores/overtakeStore";
import { usePinsStore } from "./stores/pinsStore";
import { usePlanStore } from "./stores/planStore";
import { useSessionStore, type ConnectionState } from "./stores/sessionStore";
import { bindSocket, type SocketLike } from "./socketBinding";
import { createSessionSync } from "./sessionSync";
import { createStoreHandlers } from "./storeHandlers";
import { setPlanSocket, type PlanSocket } from "./planEdits";

function resetAllStores(): void {
  useCrewStore.getState().reset();
  useTrailsStore.getState().reset();
  useLeadsStore.getState().reset();
  usePinsStore.getState().reset();
  usePlanStore.getState().reset();
  useChatStore.getState().reset();
  useOvertakeStore.getState().reset();
  useSessionStore.getState().reset();
}

/**
 * Connects the live socket for a session and keeps the stores up to date. On every (re)connect it
 * refetches the snapshot and the trails (`?since=` after a reconnect) and flushes the outbox.
 * The shared plan lands in `usePlanStore` (seeded from the snapshot, replaced on `plan:updated`).
 * Returns the connection state for the offline banner.
 */
export function useSessionSocket(sessionToken: string | null): ConnectionState {
  useEffect(() => {
    const claims = sessionToken ? decodeSessionClaims(sessionToken) : null;
    if (!sessionToken || !claims) return undefined;
    let disposed = false;
    resetAllStores();
    useCrewStore.getState().setMe(claims.memberId);
    const stopWatcher = startOvertakeWatcher();

    const socket = io(getApiUrl(), {
      auth: { token: sessionToken },
      transports: ["websocket"],
      reconnection: true,
    }) as unknown as SocketLike;
    let sync: ReturnType<typeof createSessionSync> | null = null;
    setPlanSocket(socket as unknown as PlanSocket);

    bindSocket(socket, createStoreHandlers(Date.now), {
      onConnect: () => {
        useSessionStore.getState().setConnection("online");
        void getRuntime()
          .then(({ api, flusher }) => {
            if (disposed) return;
            sync?.cancel();
            sync = createSessionSync({ api, sessionId: claims.sessionId, token: sessionToken });
            void sync.run();
            return flusher.flush(claims.sessionId, sessionToken);
          })
          .catch((error: unknown) => logger.warn("reconnect sync failed", error));
      },
      onDisconnect: () => useSessionStore.getState().setConnection("offline"),
      onConnectError: (error) => {
        logger.warn("socket connect error", error.message);
        useSessionStore.getState().setConnection("offline");
      },
    });

    return () => {
      disposed = true;
      sync?.cancel();
      stopWatcher();
      setPlanSocket(null);
      socket.disconnect();
    };
  }, [sessionToken]);

  return useSessionStore((s) => s.connection);
}
