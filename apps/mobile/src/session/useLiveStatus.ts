/** Offline pill, pending-sync count and the "passed you" banner for the Session tab. */
import { useEffect, useState } from "react";
import { pendingOutboxCount } from "../location";
import { logger } from "../realtime/logger";
import { useOvertakeStore, type OvertakeEvent } from "../realtime/stores/overtakeStore";
import { useSessionStore } from "../realtime/stores/sessionStore";
import { useActiveSession } from "./activeSessionStore";

export { overtakeCopy, pendingLabel } from "./liveCopy";

const PENDING_POLL_MS = 5_000;
const OVERTAKE_BANNER_MS = 8_000;

export interface LiveStatus {
  /** True only for a real session whose socket is disconnected. */
  offline: boolean;
  /** Leads, pings, pins and messages still waiting for the server. */
  pending: number;
  overtake: OvertakeEvent | null;
  dismissOvertake: () => void;
}

function usePendingCount(sessionId: string | null): number {
  const [pending, setPending] = useState<{ sessionId: string; count: number } | null>(null);
  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;
    const refresh = () =>
      pendingOutboxCount(sessionId)
        .then((count) => {
          if (!cancelled) setPending({ sessionId, count });
        })
        .catch((error: unknown) => logger.warn("session: could not read the outbox", error));
    void refresh();
    const timer = setInterval(() => void refresh(), PENDING_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId]);
  return pending && pending.sessionId === sessionId ? pending.count : 0;
}

export function useLiveStatus(): LiveStatus {
  const sessionId = useActiveSession((s) => s.active?.sessionId ?? null);
  const connection = useSessionStore((s) => s.connection);
  const overtake = useOvertakeStore((s) => s.latest);
  const dismissOvertake = useOvertakeStore((s) => s.dismiss);
  const pending = usePendingCount(sessionId);
  useEffect(() => {
    if (!overtake) return undefined;
    const timer = setTimeout(dismissOvertake, OVERTAKE_BANNER_MS);
    return () => clearTimeout(timer);
  }, [overtake, dismissOvertake]);
  return {
    offline: sessionId !== null && connection === "offline",
    pending,
    overtake: sessionId ? overtake : null,
    dismissOvertake,
  };
}
