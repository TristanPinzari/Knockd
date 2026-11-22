import type { OutboxItem, OutboxStore, Reschedule } from "./types";

/** In-memory OutboxStore: used by tests and as a fallback if SQLite cannot open. Never mutates stored items. */
export function createMemoryOutboxStore(): OutboxStore {
  let items: readonly OutboxItem[] = [];
  return {
    enqueue: async (incoming) => {
      const known = new Set(items.map((i) => i.id));
      const fresh = incoming.filter((i, idx) => !known.has(i.id) && incoming.findIndex((x) => x.id === i.id) === idx);
      items = [...items, ...fresh];
    },
    due: async (sessionId, now, limit) =>
      items
        .filter((i) => i.sessionId === sessionId && i.nextAttemptAt <= now)
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, limit),
    remove: async (ids) => {
      const gone = new Set(ids);
      items = items.filter((i) => !gone.has(i.id));
    },
    reschedule: async (updates: readonly Reschedule[]) => {
      const byId = new Map(updates.map((u) => [u.id, u]));
      items = items.map((i) => {
        const u = byId.get(i.id);
        return u ? { ...i, attempts: u.attempts, nextAttemptAt: u.nextAttemptAt } : i;
      });
    },
    count: async (sessionId) => items.filter((i) => sessionId === undefined || i.sessionId === sessionId).length,
    clearSession: async (sessionId) => {
      items = items.filter((i) => i.sessionId !== sessionId);
    },
  };
}
