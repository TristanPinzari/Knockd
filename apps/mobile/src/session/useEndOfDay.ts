/**
 * Loads the End of day stats for the session that just ended. The server processes a session
 * within seconds of the end (snapping trails to streets): until then distances are estimates, so
 * this polls GET /stats until `final` (the socket is closed by now). After PROCESSING_WAIT_MS it
 * shows the estimates anyway.
 */
import { useCallback, useEffect, useState } from "react";
import type { Member, SessionStatsRes } from "@knockd/shared";
import { logger } from "../realtime/logger";
import { getRuntime } from "../realtime/runtime";
import type { ActiveSession } from "./activeSessionStore";

export const PROCESSING_POLL_MS = 3000;
export const PROCESSING_WAIT_MS = 60_000;

export type EndOfDayState =
  | { readonly phase: "waiting" }
  | {
      readonly phase: "ready";
      readonly stats: SessionStatsRes;
      readonly members: readonly Member[];
    }
  | { readonly phase: "error"; readonly message: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useEndOfDay(session: ActiveSession | null): { state: EndOfDayState; retry: () => void } {
  const [state, setState] = useState<EndOfDayState>({ phase: "waiting" });
  const [attempt, setAttempt] = useState(0);
  const sessionId = session?.sessionId ?? null;
  const token = session?.token ?? null;

  useEffect(() => {
    if (!sessionId || !token) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { api } = await getRuntime();
        const giveUpAt = Date.now() + PROCESSING_WAIT_MS;
        // Names and colours (people who left are still in the session's members).
        const { members } = await api.getSnapshot(sessionId, token);
        let stats = await api.getStats(sessionId, token);
        while (!cancelled && !stats.final && Date.now() < giveUpAt) {
          await sleep(PROCESSING_POLL_MS);
          if (!cancelled) stats = await api.getStats(sessionId, token);
        }
        if (!cancelled) setState({ phase: "ready", stats, members });
      } catch (error) {
        logger.warn("end of day: could not load stats", error);
        if (!cancelled)
          setState({ phase: "error", message: "Couldn't load the stats. Check your signal and try again." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, token, attempt]);

  const retry = useCallback(() => {
    setState({ phase: "waiting" });
    setAttempt((n) => n + 1);
  }, []);
  return { state, retry };
}
