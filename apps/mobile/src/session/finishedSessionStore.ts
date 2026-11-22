/**
 * The session that just ended on this phone, kept after the live session is cleared so the End of
 * day screen can still load its stats (the session token works for days after the end). Cleared
 * when the user leaves that screen. In memory only: reopening the app later starts fresh.
 */
import { create } from "zustand";
import type { ActiveSession } from "./activeSessionStore";

interface FinishedSessionState {
  finished: ActiveSession | null;
  setFinished(session: ActiveSession): void;
  clear(): void;
}

export const useFinishedSession = create<FinishedSessionState>()((set) => ({
  finished: null,
  setFinished: (session) => set({ finished: { ...session } }),
  clear: () => set({ finished: null }),
}));
