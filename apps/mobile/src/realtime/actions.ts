/**
 * Writes the UI needs: mark a lead, edit/undo it, chat, drop a pin. Each one is queued in the
 * outbox first (so it survives being offline), shown locally straight away, then flushed.
 */
import type { Grade, Lead } from "@knockd/shared";
import type { Outbox } from "./outbox/outbox";
import { useChatStore } from "./stores/chatStore";
import { useCrewStore } from "./stores/crewStore";
import { useLeadsStore } from "./stores/leadsStore";
import { usePinsStore } from "./stores/pinsStore";

export interface ActionDeps {
  outbox: Outbox;
  sessionId: string;
  /** Called after queueing so the app can try to send right away. */
  kickFlush: () => void;
  now?: () => number;
}

export interface SessionActions {
  markLead(input: { houseId: number; grade: Grade; note?: string }): Promise<string>;
  editLead(clientId: string, change: { grade?: Grade; note?: string | null }): Promise<void>;
  undoLead(clientId: string): Promise<void>;
  sendMessage(body: string): Promise<string>;
  dropPin(pin: { lat: number; lng: number; label?: string }): Promise<string>;
  removePin(clientId: string): Promise<void>;
}

export function createSessionActions({ outbox, sessionId, kickFlush, now = Date.now }: ActionDeps): SessionActions {
  const me = (): string => {
    const id = useCrewStore.getState().myMemberId;
    if (!id) throw new Error("Not in a session yet");
    return id;
  };
  const iso = (): string => new Date(now()).toISOString();

  return {
    markLead: async ({ houseId, grade, note }) => {
      const memberId = me();
      const t = now();
      const clientId = await outbox.enqueueLead(sessionId, { houseId, grade, note, t });
      const lead: Lead = { clientId, memberId, houseId, grade, note: note ?? null, createdAt: iso(), updatedAt: iso() };
      useLeadsStore.getState().upsert(lead);
      kickFlush();
      return clientId;
    },
    editLead: async (clientId, change) => {
      const existing = useLeadsStore.getState().leads[clientId];
      await outbox.enqueueLeadPatch(sessionId, clientId, change);
      if (existing) {
        useLeadsStore.getState().upsert({
          ...existing,
          grade: change.grade ?? existing.grade,
          note: change.note === undefined ? existing.note : change.note,
          updatedAt: iso(),
        });
      }
      kickFlush();
    },
    undoLead: async (clientId) => {
      await outbox.enqueueLeadDelete(sessionId, clientId);
      useLeadsStore.getState().remove(clientId);
      kickFlush();
    },
    sendMessage: async (body) => {
      const memberId = me();
      const clientId = await outbox.enqueueMessage(sessionId, body);
      useChatStore.getState().receive({ clientId, memberId, body, createdAt: iso() }, memberId);
      kickFlush();
      return clientId;
    },
    dropPin: async (pin) => {
      const memberId = me();
      const clientId = await outbox.enqueuePin(sessionId, pin);
      usePinsStore
        .getState()
        .upsert({ clientId, memberId, lat: pin.lat, lng: pin.lng, label: pin.label ?? null, createdAt: iso() });
      kickFlush();
      return clientId;
    },
    removePin: async (clientId) => {
      await outbox.enqueuePinDelete(sessionId, clientId);
      usePinsStore.getState().remove(clientId);
      kickFlush();
    },
  };
}
