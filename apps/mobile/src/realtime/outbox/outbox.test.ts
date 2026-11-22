import { describe, expect, it, vi } from "vitest";
import { backoffDelayMs, BACKOFF_BASE_MS, BACKOFF_CAP_MS } from "./backoff";
import { createMemoryOutboxStore } from "./memoryStore";
import { createOutbox, fixToPing } from "./outbox";
import { uuid } from "../testUtils";

describe("backoffDelayMs", () => {
  it("grows exponentially with jitter and caps", () => {
    expect(backoffDelayMs(0, () => 1)).toBe(BACKOFF_BASE_MS);
    expect(backoffDelayMs(0, () => 0)).toBe(BACKOFF_BASE_MS / 2);
    expect(backoffDelayMs(3, () => 1)).toBe(BACKOFF_BASE_MS * 8);
    expect(backoffDelayMs(50, () => 1)).toBe(BACKOFF_CAP_MS);
    expect(backoffDelayMs(-1, () => 1)).toBe(BACKOFF_BASE_MS);
    expect(backoffDelayMs(1)).toBeGreaterThan(0);
  });
});

describe("outbox facade", () => {
  const setup = () => {
    let n = 0;
    const store = createMemoryOutboxStore();
    const outbox = createOutbox({ store, newId: () => uuid(++n), now: () => 1_700_000_000_000 });
    return { store, outbox };
  };

  it("queues pings with client ids and ISO times", async () => {
    const { outbox } = setup();
    const pings = await outbox.enqueuePings("s", [
      { lat: 1, lng: 2, accuracy: null, t: 1_700_000_000_000 },
      { lat: 1, lng: 2, accuracy: 4, t: 1_700_000_005_000 },
    ]);
    expect(pings[0]).toMatchObject({ accuracy: 50, t: "2023-11-14T22:13:20.000Z" });
    expect(pings[0]?.clientId).not.toBe(pings[1]?.clientId);
    expect(await outbox.pending("s")).toBe(2);
    expect(await outbox.pending()).toBe(2);
    expect(await outbox.pending("other")).toBe(0);
  });

  it("queues leads, messages, pins and ops", async () => {
    const { outbox, store } = setup();
    const leadId = await outbox.enqueueLead("s", { houseId: 5, grade: "A", note: "hi" });
    await outbox.enqueueLead("s", { houseId: 6, grade: "B" });
    await outbox.enqueueLeadPatch("s", leadId, { grade: "C" });
    await outbox.enqueueLeadDelete("s", leadId);
    await outbox.enqueueMessage("s", "hello");
    await outbox.enqueuePin("s", { lat: 1, lng: 2, label: "meet" });
    await outbox.enqueuePin("s", { lat: 1, lng: 2 });
    await outbox.enqueuePinDelete("s", uuid(99));
    const items = await store.due("s", Date.now(), 100);
    expect(items.map((i) => i.payload.kind)).toEqual([
      "lead",
      "lead",
      "leadPatch",
      "leadDelete",
      "message",
      "pin",
      "pin",
      "pinDelete",
    ]);
    expect(items[0]?.payload).toMatchObject({ body: { houseId: 5, note: "hi" } });
    expect(items[1]?.payload).not.toHaveProperty("body.note");
  });

  it("fixToPing never reports negative accuracy", () => {
    expect(fixToPing({ lat: 0, lng: 0, accuracy: -1, t: 0 }, uuid(1)).accuracy).toBe(0);
  });
});

describe("memory store", () => {
  const item = (id: string, createdAt: number, extra = {}) => ({
    id,
    sessionId: "s",
    createdAt,
    attempts: 0,
    nextAttemptAt: 0,
    payload: { kind: "pinDelete" as const, pinClientId: id },
    ...extra,
  });
  it("ignores duplicate ids, orders by time, respects nextAttemptAt, reschedules, removes", async () => {
    const store = createMemoryOutboxStore();
    await store.enqueue([item("b", 2), item("a", 1), item("a", 1), item("c", 3, { nextAttemptAt: 100 })]);
    await store.enqueue([item("a", 1)]);
    expect((await store.due("s", 50, 10)).map((i) => i.id)).toEqual(["a", "b"]);
    expect((await store.due("s", 100, 1)).map((i) => i.id)).toEqual(["a"]);
    await store.reschedule([{ id: "a", attempts: 2, nextAttemptAt: 500 }]);
    expect((await store.due("s", 50, 10)).map((i) => i.id)).toEqual(["b"]);
    await store.remove(["b"]);
    expect(await store.count()).toBe(2);
    await store.clearSession("s");
    expect(await store.count()).toBe(0);
  });
});

describe("vi sanity", () => {
  it("fake timers available", () => {
    vi.useFakeTimers();
    vi.useRealTimers();
  });
});
