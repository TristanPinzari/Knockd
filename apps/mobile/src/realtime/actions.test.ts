import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionActions } from "./actions";
import { createMemoryOutboxStore } from "./outbox/memoryStore";
import { createOutbox } from "./outbox/outbox";
import { useChatStore } from "./stores/chatStore";
import { useCrewStore } from "./stores/crewStore";
import { useLeadsStore } from "./stores/leadsStore";
import { usePinsStore } from "./stores/pinsStore";
import { uuid } from "./testUtils";

const ME = uuid(1);
function setup() {
  let n = 100;
  const store = createMemoryOutboxStore();
  const outbox = createOutbox({ store, newId: () => uuid(++n), now: () => 5_000 });
  const kickFlush = vi.fn();
  return { store, kickFlush, actions: createSessionActions({ outbox, sessionId: "s", kickFlush, now: () => 5_000 }) };
}

beforeEach(() => {
  useCrewStore.getState().reset();
  useLeadsStore.getState().reset();
  useChatStore.getState().reset();
  usePinsStore.getState().reset();
  useCrewStore.getState().setMe(ME);
});

describe("session actions (offline first)", () => {
  it("marks, edits and undoes a lead locally and queues each write", async () => {
    const { actions, store, kickFlush } = setup();
    const id = await actions.markLead({ houseId: 7, grade: "A", note: "n" });
    expect(useLeadsStore.getState().leads[id]).toMatchObject({ memberId: ME, grade: "A", note: "n" });
    await actions.editLead(id, { grade: "B" });
    expect(useLeadsStore.getState().leads[id]?.grade).toBe("B");
    await actions.editLead(id, { note: null });
    expect(useLeadsStore.getState().leads[id]?.note).toBeNull();
    await actions.editLead(uuid(999), { grade: "C" }); // unknown lead: still queued
    await actions.undoLead(id);
    expect(useLeadsStore.getState().leads[id]).toBeUndefined();
    expect(await store.count("s")).toBe(5);
    expect(kickFlush).toHaveBeenCalledTimes(5);
  });

  it("sends messages and pins with optimistic UI", async () => {
    const { actions, store } = setup();
    await actions.sendMessage("hi");
    expect(useChatStore.getState().messages[0]?.body).toBe("hi");
    expect(useChatStore.getState().unread).toBe(0);
    const pin = await actions.dropPin({ lat: 1, lng: 2, label: "here" });
    expect(usePinsStore.getState().pins[pin]?.label).toBe("here");
    const bare = await actions.dropPin({ lat: 1, lng: 2 });
    expect(usePinsStore.getState().pins[bare]?.label).toBeNull();
    await actions.removePin(pin);
    expect(usePinsStore.getState().pins[pin]).toBeUndefined();
    expect(await store.count()).toBe(4);
  });

  it("refuses to write before joining", async () => {
    useCrewStore.getState().setMe(null);
    await expect(setup().actions.markLead({ houseId: 1, grade: "A" })).rejects.toThrow("Not in a session");
  });
});
