/** Every map on your teams, for "Load team data" when starting a session. Empty when logged out. */
import { useEffect, useState } from "react";
import { logger } from "../realtime/logger";
import { getRuntime } from "../realtime/runtime";
import { getAccountToken, useAccountStore } from "./accountStore";

export interface TeamMapChoice {
  readonly mapId: string;
  readonly name: string;
  readonly teamName: string;
}

export function useTeamMaps(): { maps: readonly TeamMapChoice[]; loading: boolean } {
  const teams = useAccountStore((s) => s.me?.teams ?? null);
  const [state, setState] = useState<{ maps: readonly TeamMapChoice[]; loading: boolean }>({
    maps: [],
    loading: false,
  });
  const key = teams?.map((t) => t.id).join(",") ?? "";

  useEffect(() => {
    if (!teams || teams.length === 0) return undefined;
    let cancelled = false;
    void (async () => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const token = await getAccountToken();
        if (!token) return;
        const { api } = await getRuntime();
        const perTeam = await Promise.all(
          teams.map(async (t) =>
            (await api.getTeamMaps(t.id, token)).maps.map((m) => ({ mapId: m.id, name: m.name, teamName: t.name })),
          ),
        );
        if (!cancelled) setState({ maps: perTeam.flat(), loading: false });
      } catch (error) {
        logger.warn("account: could not load team maps", error);
        if (!cancelled) setState({ maps: [], loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-run only when the set of teams changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
