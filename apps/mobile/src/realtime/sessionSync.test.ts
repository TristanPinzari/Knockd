import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSnapshotRes } from "@knockd/shared";
import { useTrailsStore } from "../trails/trailsStore";
import { NetworkError } from "./errors";
import { createSessionSync, MAX_SYNC_ATTEMPTS, syncOnce } from "./sessionSync";
import { useChatStore } from "./stores/chatStore";
import { useCrewStore } from "./stores/crewStore";
import { useLeadsStore } from "./stores/leadsStore";
import { usePlanStore } from "./stores/planStore";
import { useSessionStore } from "./stores/sessionStore";
import { lead, member, uuid } from "./testUtils";

const ME = uuid(1);
const SAM = uuid(2);
const snapshot = (over: Partial<SessionSnapshotRes> = {}): SessionSnapshotRes => ({
  session: { status: "live" } as never,
  members: [member(ME, "Me"), member(SAM, "Sam")],
  leads: [lead(uuid(10), SAM)],
  pins: [],
  plan: { claims: [], drawings: [], notes: [] },
  planVersion: 0,
  messages: [],
  ...over,
});

beforeEach(() => {
  useCrewStore.getState().reset();
  useTrailsStore.getState().reset();
  useLeadsStore.getState().reset();
  useChatStore.getState().reset();
  useSessionStore.getState().reset();
  usePlanStore.getState().reset();
  useCrewStore.getState().setMe(ME);
});
afterEach(() => vi.useRealTimers());

describe("syncOnce", () => {
  it("first load fetches all trails; reconnect fetches only newer points", async () => {
    const getSnapshot = vi.fn(async () => snapshot());
    const getTrails = vi.fn(async () => ({
      trails: [{ memberId: SAM, points: [[1000, 42.9, -81.3] as [number, number, number]] }],
    }));
    const deps = { api: { getSnapshot, getTrails }, sessionId: "s", token: "t" };
    await syncOnce(deps);
    expect(getTrails).toHaveBeenLastCalledWith("s", "t", null);
    expect(useSessionStore.getState().synced).toBe(true);
    expect(useLeadsStore.getState().leads[uuid(10)]).toBeDefined();
    expect(usePlanStore.getState().plan).toEqual({ claims: [], drawings: [], notes: [] });
    await syncOnce(deps);
    expect(getTrails).toHaveBeenLastCalledWith("s", "t", 1000);
    expect(useTrailsStore.getState().pointsByMember[SAM]).toHaveLength(1);
  });

  it("leaves the stores alone when a request fails", async () => {
    const deps = {
      api: { getSnapshot: vi.fn(async () => snapshot()), getTrails: vi.fn().mockRejectedValue(new NetworkError("x")) },
      sessionId: "s",
      token: "t",
    };
    await expect(syncOnce(deps)).rejects.toBeInstanceOf(NetworkError);
    expect(useCrewStore.getState().members).toEqual({});
  });
});

describe("createSessionSync", () => {
  it("retries with backoff then succeeds", async () => {
    vi.useFakeTimers();
    const getSnapshot = vi.fn().mockRejectedValueOnce(new NetworkError("x")).mockResolvedValue(snapshot());
    const sync = createSessionSync({
      api: { getSnapshot, getTrails: vi.fn(async () => ({ trails: [] })) },
      sessionId: "s",
      token: "t",
      random: () => 1,
    });
    const done = sync.run();
    await vi.advanceTimersByTimeAsync(0);
    expect(useSessionStore.getState().syncError).toBe("x");
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(done).resolves.toBe(true);
    expect(useSessionStore.getState()).toMatchObject({ synced: true, syncError: null });
  });

  it("gives up after MAX_SYNC_ATTEMPTS and can be cancelled", async () => {
    vi.useFakeTimers();
    const getSnapshot = vi.fn().mockRejectedValue(new NetworkError("down"));
    const sync = createSessionSync({
      api: { getSnapshot, getTrails: vi.fn() },
      sessionId: "s",
      token: "t",
      random: () => 0,
    });
    const done = sync.run();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await expect(done).resolves.toBe(false);
    expect(getSnapshot).toHaveBeenCalledTimes(MAX_SYNC_ATTEMPTS);
    const again = sync.run();
    await vi.advanceTimersByTimeAsync(0);
    sync.cancel();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getSnapshot).toHaveBeenCalledTimes(MAX_SYNC_ATTEMPTS + 1);
    void again;
  });
});
