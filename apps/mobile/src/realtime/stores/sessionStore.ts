import { create } from "zustand";
import type { Session, SessionStatus } from "@knockd/shared";

export type ConnectionState = "connecting" | "online" | "offline";

interface SessionState {
  status: SessionStatus;
  connection: ConnectionState;
  /** True once the snapshot for the current connection has been applied. */
  synced: boolean;
  /** Set when the snapshot/trails fetch failed (message for a retry banner). */
  syncError: string | null;
  /** The team map loaded into this session (and which layers), or null. */
  loadedMap: Session["loadedMap"];
  setLoadedMap: (loadedMap: Session["loadedMap"]) => void;
  setStatus: (status: SessionStatus) => void;
  setConnection: (connection: ConnectionState) => void;
  setSynced: (synced: boolean) => void;
  setSyncError: (message: string | null) => void;
  reset: () => void;
}

const initial = {
  status: "live" as SessionStatus,
  connection: "connecting" as ConnectionState,
  synced: false,
  syncError: null,
  loadedMap: null as Session["loadedMap"],
};

export const useSessionStore = create<SessionState>()((set) => ({
  ...initial,
  setStatus: (status) => set({ status }),
  setLoadedMap: (loadedMap) => set({ loadedMap }),
  setConnection: (connection) => set({ connection }),
  setSynced: (synced) => set({ synced }),
  setSyncError: (syncError) => set({ syncError }),
  reset: () => set({ ...initial }),
}));
