import type { Member, SessionAccessRes, SessionStatsRes, Stats } from "@knockd/shared";
import type { ApiClient } from "../../realtime/api";
import { setActiveSessionStorage, useActiveSession } from "../activeSessionStore";
import { activeLabel, distanceLabel, leadsLabel, personRows } from "../endOfDay";
import { useFinishedSession } from "../finishedSessionStore";
import { createSessionLifecycle, toActiveSession } from "../lifecycle";

const SID = "00000000-0000-4000-8000-000000000001";
const ME = "00000000-0000-4000-8000-000000000002";
const JAS = "00000000-0000-4000-8000-000000000003";
const GONE = "00000000-0000-4000-8000-000000000004";

const stats = (A: number, B: number, C: number, houses = 10): Stats => ({
  streetsWorked: 3,
  streetsPassed: 1,
  blocksCompleted: 1,
  housesCovered: houses,
  leads: { A, B, C },
  distanceM: 2400,
  activeS: 5400,
});
const member = (id: string, displayName: string): Member => ({
  id,
  displayName,
  colour: "#E4572E",
  isGuest: true,
  isBot: false,
  online: false,
  lastPosition: null,
});

describe("personRows", () => {
  const res: SessionStatsRes = {
    crew: stats(2, 1, 3, 60),
    members: [
      { memberId: ME, ...stats(0, 1, 2, 30) },
      { memberId: JAS, ...stats(2, 0, 0, 20) },
      { memberId: GONE, ...stats(0, 0, 1, 10) },
    ],
    final: true,
  };

  it("orders by A leads, then B, then C, and marks me", () => {
    const rows = personRows(res, [member(ME, "Tristan"), member(JAS, "Jasmine")], ME);
    expect(rows.map((r) => r.name)).toEqual(["Jasmine", "Tristan", "A teammate"]);
    expect(rows.find((r) => r.isMe)?.memberId).toBe(ME);
  });
});

describe("labels", () => {
  it("formats distance, time and leads plainly", () => {
    expect(distanceLabel(850)).toBe("850 m");
    expect(distanceLabel(2400)).toBe("2.4 km");
    expect(activeLabel(40 * 60)).toBe("40 min");
    expect(activeLabel(135 * 60)).toBe("2 h 15 min");
    expect(leadsLabel(stats(3, 1, 0))).toBe("3 A · 1 B");
    expect(leadsLabel(stats(0, 0, 0))).toBe("No leads");
  });
});

describe("ending a session", () => {
  const access: SessionAccessRes = {
    session: {
      id: SID,
      joinCode: "KNK482",
      status: "live",
      startedAt: "2026-11-22T15:00:00.000Z",
      endedAt: null,
      createdByMemberId: ME,
      plannedArea: { type: "Polygon", coordinates: [] },
      loadedMap: null,
    },
    member: member(ME, "Tristan"),
    token: "session-token",
  };

  beforeEach(() => {
    setActiveSessionStorage(null);
    useActiveSession.setState({ active: toActiveSession(access), hydrated: true });
    useFinishedSession.getState().clear();
  });

  it("sends the queue before ending, then keeps the session for the End of day screen", async () => {
    const calls: string[] = [];
    const api = { endSession: jest.fn(async () => void calls.push("end")) } as unknown as ApiClient;
    const lifecycle = createSessionLifecycle({
      getApi: async () => api,
      stopTracking: async () => void calls.push("stop"),
      resetStores: () => void calls.push("reset"),
      flush: async () => void calls.push("flush"),
    });
    await lifecycle.end();
    expect(calls[0]).toBe("flush");
    expect(calls.indexOf("end")).toBeLessThan(calls.indexOf("reset"));
    expect(useActiveSession.getState().active).toBeNull();
    expect(useFinishedSession.getState().finished?.sessionId).toBe(SID);
  });

  it("leaving doesn't keep the session", async () => {
    const api = { leaveSession: jest.fn(async () => undefined) } as unknown as ApiClient;
    const lifecycle = createSessionLifecycle({
      getApi: async () => api,
      stopTracking: async () => undefined,
      resetStores: () => undefined,
    });
    await lifecycle.leave();
    expect(useFinishedSession.getState().finished).toBeNull();
  });

  it("a queue that can't send (no signal) doesn't block the end", async () => {
    jest.useFakeTimers();
    const api = { endSession: jest.fn(async () => undefined) } as unknown as ApiClient;
    const lifecycle = createSessionLifecycle({
      getApi: async () => api,
      stopTracking: async () => undefined,
      resetStores: () => undefined,
      flush: () => new Promise(() => undefined), // never finishes
    });
    const ending = lifecycle.end();
    await jest.advanceTimersByTimeAsync(20_000);
    await ending;
    expect(api.endSession).toHaveBeenCalled();
    expect(useFinishedSession.getState().finished?.sessionId).toBe(SID);
    jest.useRealTimers();
  });
});
