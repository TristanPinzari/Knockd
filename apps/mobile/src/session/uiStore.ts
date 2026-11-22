import { create } from "zustand";

interface SessionUiState {
  sessionLive: boolean;
  crewOn: boolean;
  /** Battery saver: record GPS less often (every ~25 m, sent every 30 s). */
  batterySaver: boolean;
  setBatterySaver: (on: boolean) => void;
  setSessionLive: (live: boolean) => void;
  setCrewOn: (on: boolean) => void;
}

/** Session UI flags shared by Home and the Live map (is a session live, is the Crew view on). */
export const useSessionUi = create<SessionUiState>((set) => ({
  sessionLive: false,
  crewOn: false,
  batterySaver: false,
  setBatterySaver: (batterySaver) => set({ batterySaver }),
  setSessionLive: (sessionLive) => set({ sessionLive }),
  setCrewOn: (crewOn) => set({ crewOn }),
}));
