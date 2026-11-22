import { describe, expect, it, vi } from "vitest";
import { MAX_PINGS_PER_BATCH } from "@knockd/shared";
import { ApiRequestError, NetworkError } from "../errors";
import { createFlusher } from "./flusher";
import { createMemoryOutboxStore } from "./memoryStore";
import { createOutbox } from "./outbox";
import { uuid } from "../testUtils";

function setup(apiOverrides: Record<string, unknown> = {}) {
  let n = 0;
  let clock = 1_000_000;
  const store = createMemoryOutboxStore();
  const outbox = createOutbox({ store, newId: () => uuid(++n), now: () => clock });
  const api = {
    postPings: vi.fn(async () => ({ accepted: 0 })),
    postLead: vi.fn(async () => ({})),
    patchLead: vi.fn(async () => ({})),
    deleteLead: vi.fn(async () => undefined),
    postMessage: vi.fn(async () => ({})),
    postPin: vi.fn(async () => ({})),
    deletePin: vi.fn(async () => undefined),
    ...apiOverrides,
  } as never;
  const flusher = createFlusher({ store, api, now: () => clock, random: () => 1, pageSize: 1000 });
  return {
    store,
    outbox,
    flusher,
    api: api as Record<string, ReturnType<typeof vi.fn>>,
    advance: (ms: number) => (clock += ms),
  };
}
const fix = (i: number) => ({ lat: 42.9, lng: -81.3, accuracy: 5, t: 1_700_000_000_000 + i * 1000 });

describe("flusher", () => {
  it("sends pings in one batch and acknowledges (removes) them", async () => {
    const { outbox, flusher, api } = setup();
    await outbox.enqueuePings("s", [fix(0), fix(1), fix(2)]);
    const res = await flusher.flush("s", "tok");
    expect(res).toMatchObject({ status: "ok", sent: 3, remaining: 0 });
    expect(api.postPings).toHaveBeenCalledTimes(1);
    expect(api.postPings?.mock.calls[0]?.[2]).toHaveLength(3);
  });

  it("splits more than the batch limit into several requests", async () => {
    const { outbox, flusher, api } = setup();
    await outbox.enqueuePings(
      "s",
      Array.from({ length: MAX_PINGS_PER_BATCH + 5 }, (_, i) => fix(i)),
    );
    await flusher.flush("s", "tok");
    expect(api.postPings?.mock.calls.map((c) => (c[2] as unknown[]).length)).toEqual([MAX_PINGS_PER_BATCH, 5]);
  });

  it("keeps items and backs off on network errors, then succeeds later", async () => {
    const postPings = vi.fn().mockRejectedValueOnce(new NetworkError("offline")).mockResolvedValue({ accepted: 1 });
    const { outbox, flusher, advance, store } = setup({ postPings });
    await outbox.enqueuePings("s", [fix(0)]);
    expect(await flusher.flush("s", "t")).toMatchObject({ status: "retry", sent: 0, remaining: 1 });
    expect(await flusher.flush("s", "t")).toMatchObject({ status: "ok", sent: 0, remaining: 1 }); // not due yet
    advance(10_000);
    expect(await flusher.flush("s", "t")).toMatchObject({ status: "ok", sent: 1, remaining: 0 });
    expect(await store.count()).toBe(0);
  });

  it("sends leads then patches in order and stops at the first retryable failure", async () => {
    const postLead = vi.fn().mockRejectedValue(new ApiRequestError(503, null, "down"));
    const { outbox, flusher, api } = setup({ postLead });
    const id = await outbox.enqueueLead("s", { houseId: 1, grade: "A" });
    await outbox.enqueueLeadPatch("s", id, { grade: "B" });
    const res = await flusher.flush("s", "t");
    expect(res.status).toBe("retry");
    expect(api.patchLead).not.toHaveBeenCalled();
  });

  it("sends every kind", async () => {
    const { outbox, flusher, api } = setup();
    const id = await outbox.enqueueLead("s", { houseId: 1, grade: "A" });
    await outbox.enqueueLeadPatch("s", id, { grade: "B" });
    await outbox.enqueueLeadDelete("s", id);
    await outbox.enqueueMessage("s", "hi");
    const pin = await outbox.enqueuePin("s", { lat: 1, lng: 1 });
    await outbox.enqueuePinDelete("s", pin);
    const res = await flusher.flush("s", "t");
    expect(res).toMatchObject({ status: "ok", sent: 6, remaining: 0 });
    for (const k of ["postLead", "patchLead", "deleteLead", "postMessage", "postPin", "deletePin"])
      expect(api[k]).toHaveBeenCalledTimes(1);
  });

  it("drops a rejected (400) lead so it cannot block the queue", async () => {
    const postLead = vi.fn().mockRejectedValueOnce(new ApiRequestError(400, "invalid_request", "bad"));
    const { outbox, flusher } = setup({ postLead });
    await outbox.enqueueLead("s", { houseId: 1, grade: "A" });
    await outbox.enqueueMessage("s", "still sent");
    expect(await flusher.flush("s", "t")).toMatchObject({ status: "ok", dropped: 1, sent: 1, remaining: 0 });
  });

  it("bisects a ping batch to isolate one bad ping", async () => {
    const postPings = vi.fn(async (_s: string, _t: string, pings: { t: string }[]) => {
      if (pings.some((p) => p.t === new Date(fix(3).t).toISOString()))
        throw new ApiRequestError(400, "invalid_request", "bad");
      return { accepted: pings.length };
    });
    const { outbox, flusher } = setup({ postPings });
    await outbox.enqueuePings("s", [0, 1, 2, 3, 4, 5].map(fix));
    expect(await flusher.flush("s", "t")).toMatchObject({ status: "ok", sent: 5, dropped: 1, remaining: 0 });
  });

  it("stops on 401 without losing data", async () => {
    const postPings = vi.fn().mockRejectedValue(new ApiRequestError(401, "unauthorized", "no"));
    const { outbox, flusher } = setup({ postPings });
    await outbox.enqueuePings("s", [fix(0)]);
    expect(await flusher.flush("s", "t")).toMatchObject({ status: "unauthorized", remaining: 1 });
  });

  it("clears the session queue when the session has ended", async () => {
    const postPings = vi.fn().mockRejectedValue(new ApiRequestError(410, "session_ended", "over"));
    const { outbox, flusher } = setup({ postPings });
    await outbox.enqueuePings("s", [fix(0)]);
    await outbox.enqueueMessage("s", "x");
    expect(await flusher.flush("s", "t")).toMatchObject({ status: "ended", remaining: 0 });
  });

  it("is single-flight per session", async () => {
    const { outbox, flusher, api } = setup();
    await outbox.enqueuePings("s", [fix(0)]);
    const [a, b] = await Promise.all([flusher.flush("s", "t"), flusher.flush("s", "t")]);
    expect(a).toBe(b);
    expect(api.postPings).toHaveBeenCalledTimes(1);
  });

  it("drains a backlog larger than one page", async () => {
    const store = createMemoryOutboxStore();
    let n = 0;
    const outbox = createOutbox({ store, newId: () => uuid(++n), now: () => 1 });
    const api = { postPings: vi.fn(async () => ({ accepted: 1 })) } as never;
    const flusher = createFlusher({ store, api, now: () => 1, pageSize: 3 });
    await outbox.enqueuePings("s", [0, 1, 2, 3, 4, 5, 6].map(fix));
    expect(await flusher.flush("s", "t")).toMatchObject({ sent: 7, remaining: 0 });
  });
});
