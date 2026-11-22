import { create } from "zustand";

interface SessionUiState {
  sessionLive: boolean;
  crewOn: boolean;
  setSessionLive: (live: boolean) => void;
  setCrewOn: (on: boolean) => void;
}

/** Session UI flags shared by Home and the Live map (is a session live, is the Crew view on). */
export const useSessionUi = create<SessionUiState>((set) => ({
  sessionLive: false,
  crewOn: false,
  setSessionLive: (sessionLive) => set({ sessionLive }),
  setCrewOn: (crewOn) => set({ crewOn }),
}));
