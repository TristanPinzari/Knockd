import { create } from "zustand";

export interface OvertakeEvent {
  memberId: string;
  name: string;
  /** Their leads total now, and mine. */
  theirLeads: number;
  myLeads: number;
  /** ms since epoch */
  at: number;
}

interface OvertakeState {
  /** The "Sam passed you" banner shows while this is set. */
  latest: OvertakeEvent | null;
  push: (event: OvertakeEvent) => void;
  dismiss: () => void;
  reset: () => void;
}

export const useOvertakeStore = create<OvertakeState>()((set) => ({
  latest: null,
  push: (latest) => set({ latest }),
  dismiss: () => set({ latest: null }),
  reset: () => set({ latest: null }),
}));
