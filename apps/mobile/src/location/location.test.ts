import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBatchProcessor, type CredentialStore, type TrackingCredentials } from "./batchProcessor";
import { selectFixesToRecord } from "./filter";
import { TRACKING_MODES } from "./modes";
import { useMyLocationStore } from "./myLocationStore";
import { ensureTrackingPermission, type PermissionApi, type PermissionResponse } from "./permissions";
import { createTracker } from "./tracker";
import type { LocationFix } from "./types";
import { createMemoryOutboxStore } from "../realtime/outbox/memoryStore";
import { createOutbox } from "../realtime/outbox/outbox";
import { uuid } from "../realtime/testUtils";

const M = 1 / 81_600; // degrees of longitude per metre at 42.955
const fix = (metresEast: number, t: number, accuracy: number | null = 5): LocationFix => ({
  lat: 42.955,
  lng: -81.3425 + metresEast * M,
  accuracy,
  t,
});

describe("selectFixesToRecord (10 m rule)", () => {
  const cfg = TRACKING_MODES.standard;
  it("records the first fix then only fixes 10 m or more away", () => {
    const r = selectFixesToRecord(null, [fix(0, 1), fix(4, 2), fix(9, 3), fix(11, 4), fix(15, 5), fix(22, 6)], cfg);
    expect(r.recorded.map((f) => f.t)).toEqual([1, 4, 6]);
    expect(r.last?.t).toBe(6);
  });
  it("drops poor accuracy, duplicates and out-of-order fixes, and does not mutate input", () => {
    const input = [fix(30, 3), fix(0, 1), fix(50, 2, 500), fix(20, 1)];
    const copy = [...input];
    const r = selectFixesToRecord(null, input, cfg);
    expect(input).toEqual(copy);
    expect(r.recorded.map((f) => f.t)).toEqual([1, 3]);
    expect(selectFixesToRecord(r.last, [fix(0, 2)], cfg).recorded).toEqual([]);
  });
  it("accepts null accuracy; saver mode needs 25 m", () => {
    expect(selectFixesToRecord(null, [fix(0, 1, null)], cfg).recorded).toHaveLength(1);
    expect(selectFixesToRecord(fix(0, 1), [fix(20, 2)], TRACKING_MODES.saver).recorded).toEqual([]);
    expect(TRACKING_MODES.saver.flushIntervalMs).toBeGreaterThan(TRACKING_MODES.standard.flushIntervalMs);
  });
});

const resp = (status: PermissionResponse["status"], canAskAgain = true): PermissionResponse => ({
  status,
  canAskAgain,
});
function permApi(o: Partial<Record<keyof PermissionApi, PermissionResponse>>): PermissionApi {
  return {
    getForeground: vi.fn(async () => o.getForeground ?? resp("undetermined")),
    requestForeground: vi.fn(async () => o.requestForeground ?? resp("granted")),
    getBackground: vi.fn(async () => o.getBackground ?? resp("undetermined")),
    requestBackground: vi.fn(async () => o.requestBackground ?? resp("granted")),
  };
}

describe("ensureTrackingPermission", () => {
  it("asks foreground then background and returns always", async () => {
    const api = permApi({});
    expect(await ensureTrackingPermission(api)).toBe("always");
    expect(api.requestForeground).toHaveBeenCalled();
    expect(api.requestBackground).toHaveBeenCalled();
  });
  it("does not re-ask what is already granted", async () => {
    const api = permApi({ getForeground: resp("granted"), getBackground: resp("granted") });
    expect(await ensureTrackingPermission(api)).toBe("always");
    expect(api.requestForeground).not.toHaveBeenCalled();
    expect(api.requestBackground).not.toHaveBeenCalled();
  });
  it("foreground-only when background is refused or cannot be asked", async () => {
    expect(await ensureTrackingPermission(permApi({ requestBackground: resp("denied", false) }))).toBe(
      "foreground-only",
    );
    const api = permApi({ getForeground: resp("granted"), getBackground: resp("denied", false) });
    expect(await ensureTrackingPermission(api)).toBe("foreground-only");
    expect(api.requestBackground).not.toHaveBeenCalled();
  });
  it("denied vs blocked, never asking background without foreground", async () => {
    const denied = permApi({ requestForeground: resp("denied", true) });
    expect(await ensureTrackingPermission(denied)).toBe("denied");
    expect(denied.requestBackground).not.toHaveBeenCalled();
    expect(await ensureTrackingPermission(permApi({ requestForeground: resp("denied", false) }))).toBe("blocked");
    const blocked = permApi({ getForeground: resp("denied", false) });
    expect(await ensureTrackingPermission(blocked)).toBe("blocked");
    expect(blocked.requestForeground).not.toHaveBeenCalled();
  });
});

function memoryCreds(
  initial: TrackingCredentials | null = null,
): CredentialStore & { current: () => TrackingCredentials | null } {
  let value = initial;
  return {
    save: async (c) => void (value = c),
    load: async () => value,
    clear: async () => void (value = null),
    current: () => value,
  };
}

describe("batch processor", () => {
  const setup = (creds: CredentialStore) => {
    let clock = 1_000_000;
    let n = 0;
    const store = createMemoryOutboxStore();
    const outbox = createOutbox({ store, newId: () => uuid(++n), now: () => clock });
    const flusher = { flush: vi.fn(async () => ({ status: "ok" as const, sent: 0, dropped: 0, remaining: 0 })) };
    const onFix = vi.fn();
    const onRecorded = vi.fn();
    const processor = createBatchProcessor({
      credentials: creds,
      outbox,
      flusher,
      onFix,
      onRecorded,
      now: () => clock,
    });
    return { store, flusher, onFix, onRecorded, processor, advance: (ms: number) => (clock += ms) };
  };

  it("ignores batches when tracking was stopped", async () => {
    const { processor, onFix, store } = setup(memoryCreds());
    await processor.process([fix(0, 1)]);
    expect(onFix).not.toHaveBeenCalled();
    expect(await store.count()).toBe(0);
  });

  it("queues kept points, moves the dot on every fix, flushes at most once per interval", async () => {
    const { processor, onFix, store, flusher, advance } = setup(
      memoryCreds({ sessionId: "s", token: "t", mode: "standard" }),
    );
    await processor.process([fix(0, 1), fix(3, 2)]);
    expect(onFix).toHaveBeenCalledWith(expect.objectContaining({ t: 2 }));
    expect(await store.count("s")).toBe(1);
    expect(flusher.flush).toHaveBeenCalledTimes(1);
    advance(5_000);
    await processor.process([fix(30, 3)]);
    expect(flusher.flush).toHaveBeenCalledTimes(1);
    advance(15_000);
    await processor.process([fix(60, 4)]);
    expect(flusher.flush).toHaveBeenCalledTimes(2);
    expect(await store.count("s")).toBe(3);
    await processor.process([]);
    processor.reset();
  });

  it("hands the points it records to the trail, with the session they belong to", async () => {
    const { processor, onRecorded } = setup(memoryCreds({ sessionId: "s", token: "t", mode: "standard" }));
    await processor.process([fix(0, 1), fix(3, 2), fix(30, 3)]);
    expect(onRecorded).toHaveBeenCalledTimes(1);
    const [sessionId, recorded] = onRecorded.mock.calls[0]!;
    expect(sessionId).toBe("s");
    expect(recorded.map((f: LocationFix) => f.t)).toEqual([1, 3]);
    await processor.process([fix(31, 4)]);
    expect(onRecorded).toHaveBeenCalledTimes(1);
  });

  it("a failing flush never throws into the OS callback", async () => {
    const { processor, flusher } = setup(memoryCreds({ sessionId: "s", token: "t", mode: "saver" }));
    flusher.flush.mockRejectedValueOnce(new Error("boom"));
    await expect(processor.process([fix(0, 1)])).resolves.toBeUndefined();
  });
});

describe("tracker", () => {
  beforeEach(() => {
    useMyLocationStore.setState({ fix: null, tracking: false, mode: null, permission: null, error: null });
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  const setup = (perm: PermissionApi, engineStart = vi.fn(async () => undefined)) => {
    const creds = memoryCreds();
    const engine = { start: engineStart, stop: vi.fn(async () => undefined) };
    const processor = { process: vi.fn(async () => undefined), reset: vi.fn() };
    const flusher = { flush: vi.fn(async () => ({ status: "ok" as const, sent: 0, dropped: 0, remaining: 0 })) };
    return {
      creds,
      engine,
      processor,
      flusher,
      tracker: createTracker({ permissions: perm, engine, credentials: creds, processor, flusher }),
    };
  };

  it("starts background tracking, saves credentials and flushes on the mode interval", async () => {
    const t = setup(permApi({}));
    expect(await t.tracker.start("s", "tok", "standard")).toEqual({ permission: "always", tracking: true });
    expect(t.engine.start).toHaveBeenCalledWith(TRACKING_MODES.standard, { background: true });
    expect(t.creds.current()).toEqual({ sessionId: "s", token: "tok", mode: "standard" });
    expect(useMyLocationStore.getState()).toMatchObject({ tracking: true, mode: "standard", permission: "always" });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(t.flusher.flush).toHaveBeenCalledWith("s", "tok");
    await t.tracker.stop();
    expect(t.engine.stop).toHaveBeenCalled();
    expect(t.creds.current()).toBeNull();
    expect(useMyLocationStore.getState().tracking).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.flusher.flush).toHaveBeenCalledTimes(1);
  });

  it("foreground-only runs without the background task; restarting stops the previous run", async () => {
    const t = setup(permApi({ requestBackground: resp("denied", false), getBackground: resp("denied", false) }));
    expect((await t.tracker.start("s", "tok", "saver")).permission).toBe("foreground-only");
    expect(t.engine.start).toHaveBeenCalledWith(TRACKING_MODES.saver, { background: false });
    await t.tracker.start("s", "tok2", "standard");
    expect(t.engine.stop).toHaveBeenCalledTimes(1);
  });

  it("does not start when permission is denied or blocked", async () => {
    const t = setup(permApi({ requestForeground: resp("denied", false) }));
    expect(await t.tracker.start("s", "t", "standard")).toEqual({ permission: "blocked", tracking: false });
    expect(t.engine.start).not.toHaveBeenCalled();
  });

  it("reports an engine failure and cleans up", async () => {
    const t = setup(permApi({}), vi.fn().mockRejectedValue(new Error("no gps")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await t.tracker.start("s", "t", "standard")).tracking).toBe(false);
    expect(useMyLocationStore.getState().error).toBe("no gps");
    expect(t.creds.current()).toBeNull();
  });

  it("my location store keeps the newest fix", () => {
    const s = useMyLocationStore.getState();
    s.setFix(fix(0, 5));
    s.setFix(fix(0, 3));
    expect(useMyLocationStore.getState().fix?.t).toBe(5);
  });
});
