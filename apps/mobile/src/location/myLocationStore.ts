import { create } from "zustand";
import type { LocationFix, TrackingMode, TrackingPermission } from "./types";

interface MyLocationState {
  fix: LocationFix | null;
  tracking: boolean;
  mode: TrackingMode | null;
  permission: TrackingPermission | null;
  /** Last start/stop error for the UI, or null. */
  error: string | null;
  setFix: (fix: LocationFix) => void;
  setTracking: (tracking: boolean, mode: TrackingMode | null) => void;
  setPermission: (permission: TrackingPermission) => void;
  setError: (error: string | null) => void;
}

export const useMyLocationStore = create<MyLocationState>()((set) => ({
  fix: null,
  tracking: false,
  mode: null,
  permission: null,
  error: null,
  setFix: (fix) => set((s) => (s.fix && s.fix.t >= fix.t ? s : { fix })),
  setTracking: (tracking, mode) => set({ tracking, mode }),
  setPermission: (permission) => set({ permission }),
  setError: (error) => set({ error }),
}));
