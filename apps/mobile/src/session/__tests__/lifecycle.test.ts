import type { SessionAccessRes } from "@knockd/shared";
import type { ApiClient } from "../../realtime/api";
import { ApiRequestError, NetworkError } from "../../realtime/errors";
import { setActiveSessionStorage, useActiveSession, type ActiveSession } from "../activeSessionStore";
import { createSessionLifecycle, toActiveSession, type LifecycleDeps } from "../lifecycle";

const SID = "00000000-0000-4000-8000-000000000001";
const ME = "00000000-0000-4000-8000-000000000002";
const HOST = "00000000-0000-4000-8000-000000000003";

function access(memberId: string, createdBy: string): SessionAccessRes {
  return {
    session: {
      id: SID,
      joinCode: "KNK482",
      status: "live",
      startedAt: "2026-11-21T15:00:00.000Z",
      endedAt: null,
      createdByMemberId: createdBy,
      plannedArea: { type: "Polygon", coordinates: [] },
      loadedMap: null,
    },
    member: {
      id: memberId,
      displayName: "Sam",
      colour: "#1F6FD6",
      isGuest: true,
      isBot: false,
      online: true,
      lastPosition: null,
    },
    token: "session-token",
  };
}

const activeSession: ActiveSession = toActiveSession(access(ME, ME));

function setup(api: Partial<ApiClient> = {}) {
  const deps: LifecycleDeps & { stopTracking: jest.Mock; resetStores: jest.Mock } = {
    getApi: async () => api as ApiClient,
    stopTracking: jest.fn(async () => undefined),
    resetStores: jest.fn(),
  };
  return { deps, lifecycle: createSessionLifecycle(deps) };
}

beforeEach(() => {
  setActiveSessionStorage(null);
  useActiveSession.setState({ active: null, hydrated: true });
});

describe("toActiveSession", () => {
  it("marks the creator as admin", () => {
    expect(toActiveSession(access(ME, ME)).isAdmin).toBe(true);
    expect(toActiveSession(access(ME, HOST))).toEqual({
      sessionId: SID,
      token: "session-token",
      memberId: ME,
      joinCode: "KNK482",
      isAdmin: false,
      displayName: "Sam",
    });
  });
});

describe("create / join", () => {
  it("activates the session returned by join", async () => {
    const joinSession = jest.fn(async () => access(ME, HOST));
    const { lifecycle } = setup({ joinSession });
    await lifecycle.join({ code: "KNK482", displayName: "Sam" });
    expect(joinSession).toHaveBeenCalledWith({ code: "KNK482", displayName: "Sam" });
    expect(useActiveSession.getState().active?.memberId).toBe(ME);
  });

  it("activates the session returned by create", async () => {
    const { lifecycle } = setup({ createSession: async () => access(ME, ME) });
    const active = await lifecycle.create({
      displayName: "Jas",
      location: { lat: 1, lng: 2 },
      area: { kind: "circle", center: { lat: 1, lng: 2 }, radiusM: 500 },
    });
    expect(active.isAdmin).toBe(true);
  });

  it("leaves no session behind when join fails", async () => {
    const { lifecycle } = setup({
      joinSession: async () => Promise.reject(new ApiRequestError(404, "session_not_found", "x")),
    });
    await expect(lifecycle.join({ code: "NOPE00", displayName: "Sam" })).rejects.toBeInstanceOf(ApiRequestError);
    expect(useActiveSession.getState().active).toBeNull();
  });
});

describe("end / leave", () => {
  it("ends on the server, then stops tracking and clears everything", async () => {
    useActiveSession.getState().setActive(activeSession);
    const endSession = jest.fn(async () => undefined);
    const { deps, lifecycle } = setup({ endSession });
    await lifecycle.end();
    expect(endSession).toHaveBeenCalledWith(SID, "session-token");
    expect(deps.stopTracking).toHaveBeenCalled();
    expect(deps.resetStores).toHaveBeenCalled();
    expect(useActiveSession.getState().active).toBeNull();
  });

  it("clears locally when the server says the session is already gone", async () => {
    useActiveSession.getState().setActive(activeSession);
    const { lifecycle } = setup({
      leaveSession: async () => Promise.reject(new ApiRequestError(410, "session_ended", "x")),
    });
    await lifecycle.leave();
    expect(useActiveSession.getState().active).toBeNull();
  });

  it("keeps the session when offline so the user can retry", async () => {
    useActiveSession.getState().setActive(activeSession);
    const { deps, lifecycle } = setup({ leaveSession: async () => Promise.reject(new NetworkError("offline")) });
    await expect(lifecycle.leave()).rejects.toBeInstanceOf(NetworkError);
    expect(deps.stopTracking).not.toHaveBeenCalled();
    expect(useActiveSession.getState().active).toEqual(activeSession);
  });

  it("does nothing without an active session", async () => {
    const endSession = jest.fn();
    const { lifecycle } = setup({ endSession });
    await lifecycle.end();
    expect(endSession).not.toHaveBeenCalled();
  });

  it("still clears when stopping tracking fails", async () => {
    useActiveSession.getState().setActive(activeSession);
    const { deps, lifecycle } = setup();
    deps.stopTracking.mockRejectedValueOnce(new Error("engine"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await lifecycle.teardown();
    warn.mockRestore();
    expect(deps.resetStores).toHaveBeenCalled();
    expect(useActiveSession.getState().active).toBeNull();
  });
});

describe("startSim", () => {
  it("starts bots at demo pace and returns how many joined", async () => {
    useActiveSession.getState().setActive(activeSession);
    const startSim = jest.fn(async () => ({ botMemberIds: [HOST, ME, SID] }));
    const { lifecycle } = setup({ startSim });
    await expect(lifecycle.startSim(3)).resolves.toBe(3);
    expect(startSim).toHaveBeenCalledWith(SID, "session-token", 3, "demo");
  });

  it("throws without an active session", async () => {
    const { lifecycle } = setup({ startSim: jest.fn() });
    await expect(lifecycle.startSim(3)).rejects.toThrow("No active session");
  });
});
