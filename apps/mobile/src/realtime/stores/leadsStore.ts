import { create } from "zustand";
import type { Lead } from "@knockd/shared";

export interface LeadAlert {
  lead: Lead;
  memberName: string;
}

interface LeadsState {
  leads: Readonly<Record<string, Lead>>;
  /** A teammate's new lead, for the in-app alert (design 06e). */
  alert: LeadAlert | null;
  seed: (leads: readonly Lead[]) => void;
  upsert: (lead: Lead) => void;
  remove: (clientId: string) => void;
  showAlert: (alert: LeadAlert) => void;
  dismissAlert: () => void;
  reset: () => void;
}

export const useLeadsStore = create<LeadsState>()((set) => ({
  leads: {},
  alert: null,
  seed: (leads) => set({ leads: Object.fromEntries(leads.map((l) => [l.clientId, l])) }),
  upsert: (lead) => set((s) => ({ leads: { ...s.leads, [lead.clientId]: lead } })),
  remove: (clientId) =>
    set((s) => {
      const { [clientId]: _gone, ...rest } = s.leads;
      return { leads: rest };
    }),
  showAlert: (alert) => set({ alert }),
  dismissAlert: () => set({ alert: null }),
  reset: () => set({ leads: {}, alert: null }),
}));
