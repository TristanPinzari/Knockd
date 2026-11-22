import { create } from "zustand";

interface SessionUiState {
  sessionLive: boolean;
  crewOn: boolean;
  setSessionLive: (live: boolean) => void;
  setCrewOn: (on: boolean) => void;
}

/** Mock UI state shared by Home, the Session tab and the live map until the real stores land. */
export const useSessionUi = create<SessionUiState>((set) => ({
  sessionLive: false,
  crewOn: false,
  setSessionLive: (sessionLive) => set({ sessionLive }),
  setCrewOn: (crewOn) => set({ crewOn }),
}));
