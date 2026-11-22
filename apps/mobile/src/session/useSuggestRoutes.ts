/**
 * "Suggest routes" for the active session: plans the whole crew over every loaded house in the
 * planned area with Suggest, and saves the best option to the shared plan (claims + one dashed route
 * per group). Every phone then draws it from `plan:updated`.
 */
import * as Crypto from "expo-crypto";
import { useState } from "react";
import { EMPTY_PLAN, suggestionToPlanOps } from "@knockd/shared";
import { plannedAreaCentre } from "@/area/cellPlanner";
import { useAreaStore } from "@/area";
import { logger } from "@/realtime/logger";
import { PlanEditError, sendPlanEdits } from "@/realtime/planEdits";
import { useCrewStore } from "@/realtime/stores/crewStore";
import { usePlanStore } from "@/realtime/stores/planStore";
import { suggestForSession } from "@/routes";

const SECONDS_PER_MINUTE = 60;

export interface SuggestRoutesState {
  readonly busy: boolean;
  readonly message: string | null;
  readonly run: () => Promise<void>;
}

/** Lets the spinner render before Suggest (100–400 ms of work) blocks the JS thread. */
const nextFrame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function planAndSave(): Promise<string> {
  const { area, plannedArea } = useAreaStore.getState();
  const start = plannedArea ? plannedAreaCentre(plannedArea) : null;
  if (!start) return "The session area hasn't loaded yet. Try again in a moment.";
  const memberIds = Object.keys(useCrewStore.getState().members);
  const result = suggestForSession({ houses: area.houses, streets: area.streets, plannedArea, memberIds, start });
  const best = result?.options[0];
  if (!best) return "There are no houses loaded in the session area yet.";
  const ops = suggestionToPlanOps(best, usePlanStore.getState().plan ?? EMPTY_PLAN, () => Crypto.randomUUID());
  await sendPlanEdits(ops);
  return `${best.label}: everyone back together in about ${Math.round(best.togetherS / SECONDS_PER_MINUTE)} min.`;
}

export function useSuggestRoutes(): SuggestRoutesState {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    await nextFrame();
    try {
      setMessage(await planAndSave());
    } catch (error) {
      logger.warn("suggest routes failed", error);
      setMessage(error instanceof PlanEditError ? error.message : "Couldn't plan routes. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, run };
}
