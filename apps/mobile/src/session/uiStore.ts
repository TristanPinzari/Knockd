import type { Layer } from "@knockd/shared";
import { create } from "zustand";

interface SessionUiState {
  sessionLive: boolean;
  crewOn: boolean;
  /** Battery saver: record GPS less often (every ~25 m, sent every 30 s). */
  batterySaver: boolean;
  /** Team map layers this person switched off on their phone (README: each toggles their own). */
  hiddenLayers: readonly Layer[];
  toggleLayer: (layer: Layer) => void;
  setBatterySaver: (on: boolean) => void;
  setSessionLive: (live: boolean) => void;
  setCrewOn: (on: boolean) => void;
}

/** Session UI flags shared by Home and the Live map (is a session live, is the Crew view on). */
export const useSessionUi = create<SessionUiState>((set) => ({
  sessionLive: false,
  crewOn: false,
  batterySaver: false,
  hiddenLayers: [],
  toggleLayer: (layer) =>
    set((s) => ({
      hiddenLayers: s.hiddenLayers.includes(layer)
        ? s.hiddenLayers.filter((l) => l !== layer)
        : [...s.hiddenLayers, layer],
    })),
  setBatterySaver: (batterySaver) => set({ batterySaver }),
  setSessionLive: (sessionLive) => set({ sessionLive }),
  setCrewOn: (crewOn) => set({ crewOn }),
}));
