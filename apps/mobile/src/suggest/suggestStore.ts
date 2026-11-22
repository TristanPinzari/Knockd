/**
 * Suggest in planning mode (README "Suggest", MOBILE.md "Suggest"):
 *   1. brush houses (must all be visited), optionally move the car and drop a regroup pin
 *   2. Suggest: plans every way of splitting the crew, best first
 *   3. look at each option on the map, swap people between groups if wanted
 *   4. Use this plan: its claims and routes go into the shared plan (undoable like any edit)
 */
import * as Crypto from "expo-crypto";
import { create } from "zustand";
import {
  DEFAULT_SECONDS_PER_DOOR,
  EMPTY_PLAN,
  suggestionToPlanOps,
  type LatLng,
  type SuggestOption,
} from "@knockd/shared";
import { useAreaStore } from "@/area";
import { plannedAreaCentre } from "@/area/cellPlanner";
import { useMyLocationStore } from "@/location/myLocationStore";
import { usePlanEditor } from "@/plan/planEditor";
import { logger } from "@/realtime/logger";
import { getRuntime } from "@/realtime/runtime";
import { useCrewStore } from "@/realtime/stores/crewStore";
import { usePlanStore } from "@/realtime/stores/planStore";
import { suggestForSession } from "@/routes";
import { brushHouses, swapMembers, type BrushMode } from "./suggestView";

/** What a finger does on the map while selecting. */
export type SuggestBrush = BrushMode | "car" | "meet";

export interface SuggestState {
  readonly brush: SuggestBrush;
  readonly selected: ReadonlySet<string>;
  /** Where routes start. Null = this phone's location (or the session centre). */
  readonly car: LatLng | null;
  /** Optional regroup pin. */
  readonly meet: LatLng | null;
  /** Options, best first (with any swaps made). Null until Suggest has run. */
  readonly options: readonly SuggestOption[] | null;
  readonly chosen: number;
  /** When Suggest ran (ms since epoch), for "back together ~7:35 pm". */
  readonly plannedAtMs: number;
  /** Selected houses with no known street (Suggest can't route them). */
  readonly unrouted: number;
  /** Someone tapped to swap; the next person tapped in another group swaps with them. */
  readonly swapping: string | null;
  readonly busy: boolean;
  readonly message: string | null;
  setBrush(brush: SuggestBrush): void;
  brushPath(path: readonly LatLng[], radiusM: number): void;
  placeAt(at: LatLng): void;
  clearSelection(): void;
  run(sessionId: string, token: string): Promise<void>;
  choose(index: number): void;
  tapMember(memberId: string): void;
  /** Back to selecting (keeps the selection, car and pin). */
  edit(): void;
  apply(myId: string): Promise<boolean>;
  reset(): void;
}

const initial = {
  brush: "add" as SuggestBrush,
  selected: new Set<string>(),
  car: null,
  meet: null,
  options: null,
  chosen: 0,
  plannedAtMs: 0,
  unrouted: 0,
  swapping: null,
  busy: false,
  message: null,
};

/** Lets the spinner draw before Suggest (100–400 ms of work) holds the JS thread. */
const nextFrame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 16));

/** The car if placed, else this phone's location, else the session centre. */
export function startPoint(car: LatLng | null): LatLng | null {
  if (car) return car;
  const fix = useMyLocationStore.getState().fix;
  if (fix) return { lat: fix.lat, lng: fix.lng };
  const planned = useAreaStore.getState().plannedArea;
  return planned ? plannedAreaCentre(planned) : null;
}

async function secondsPerDoor(sessionId: string, token: string): Promise<number> {
  try {
    return (await (await getRuntime()).api.getDoorTime(sessionId, token)).secondsPerDoor;
  } catch (error) {
    logger.warn("suggest: door time unavailable, using the default", error);
    return DEFAULT_SECONDS_PER_DOOR;
  }
}

export const useSuggestStore = create<SuggestState>()((set, get) => ({
  ...initial,
  setBrush: (brush) => set({ brush }),
  brushPath: (path, radiusM) => {
    const { brush, selected } = get();
    if (brush !== "add" && brush !== "remove") return;
    const houses = useAreaStore.getState().area.houses;
    set({ selected: brushHouses(selected, houses, path, radiusM, brush), message: null });
  },
  placeAt: (at) => {
    const { brush } = get();
    if (brush === "car") set({ car: at, brush: "add" });
    else if (brush === "meet") set({ meet: at, brush: "add" });
  },
  clearSelection: () => set({ selected: new Set(), meet: null, message: null }),

  run: async (sessionId, token) => {
    const { selected, car, meet } = get();
    const start = startPoint(car);
    if (selected.size === 0) return set({ message: "Brush over the houses to knock first." });
    if (!start) return set({ message: "Waiting for your location. Or tap Car and put it on the map." });
    set({ busy: true, message: null });
    const spd = await secondsPerDoor(sessionId, token);
    await nextFrame();
    try {
      const { houses, streets } = useAreaStore.getState().area;
      const result = suggestForSession({
        houses,
        streets,
        plannedArea: null,
        selectedHouseIds: selected,
        memberIds: Object.keys(useCrewStore.getState().members),
        start,
        regroup: meet,
        secondsPerDoor: spd,
      });
      if (!result || result.options.length === 0)
        return set({ busy: false, message: "None of those houses is on a street the app knows. Try others." });
      set({
        busy: false,
        options: result.options,
        chosen: 0,
        plannedAtMs: Date.now(),
        unrouted: result.unroutedHouseIds.length,
        // Show the car and pin where Suggest put them: snapped onto the nearest street.
        car: result.start,
        meet: result.regroup,
        swapping: null,
      });
    } catch (error) {
      logger.warn("suggest failed", error);
      set({ busy: false, message: "Couldn't plan routes for those houses. Try a different selection." });
    }
  },

  choose: (chosen) => set({ chosen, swapping: null }),

  tapMember: (memberId) => {
    const { options, chosen, swapping } = get();
    const option = options?.[chosen];
    if (!option) return;
    if (swapping === null || swapping === memberId) return set({ swapping: swapping === memberId ? null : memberId });
    const groupOf = (id: string) => option.groups.findIndex((g) => g.memberIds.includes(id));
    if (groupOf(swapping) === groupOf(memberId)) return set({ swapping: memberId });
    const swapped = swapMembers(option, swapping, memberId);
    set({ options: options.map((o, i) => (i === chosen ? swapped : o)), swapping: null });
  },

  edit: () => set({ options: null, chosen: 0, swapping: null, message: null }),

  apply: async (myId) => {
    const option = get().options?.[get().chosen];
    if (!option) return false;
    const ops = suggestionToPlanOps(option, usePlanStore.getState().plan ?? EMPTY_PLAN, () => Crypto.randomUUID());
    set({ busy: true });
    const ok = await usePlanEditor.getState().run(ops, myId);
    set(ok ? { ...initial, selected: new Set() } : { busy: false });
    return ok;
  },

  reset: () => set({ ...initial, selected: new Set() }),
}));
