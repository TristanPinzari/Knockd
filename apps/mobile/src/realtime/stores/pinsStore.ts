import { create } from "zustand";
import type { Pin } from "@knockd/shared";

interface PinsState {
  pins: Readonly<Record<string, Pin>>;
  seed: (pins: readonly Pin[]) => void;
  upsert: (pin: Pin) => void;
  remove: (clientId: string) => void;
  reset: () => void;
}

export const usePinsStore = create<PinsState>()((set) => ({
  pins: {},
  seed: (pins) => set({ pins: Object.fromEntries(pins.map((p) => [p.clientId, p])) }),
  upsert: (pin) => set((s) => ({ pins: { ...s.pins, [pin.clientId]: pin } })),
  remove: (clientId) =>
    set((s) => {
      const { [clientId]: _gone, ...rest } = s.pins;
      return { pins: rest };
    }),
  reset: () => set({ pins: {} }),
}));
