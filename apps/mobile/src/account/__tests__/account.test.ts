import type { SessionAccessRes } from "@knockd/shared";
import type { ApiClient } from "../../realtime/api";
import { placeLeads } from "../../area/leads";
import { setActiveSessionStorage, useActiveSession } from "../../session/activeSessionStore";
import { createSessionLifecycle } from "../../session/lifecycle";
import { agoLabel } from "../../ui/format";
import { getAccountToken, useAccountStore } from "../accountStore";

const SID = "00000000-0000-4000-8000-000000000001";
const ME = "00000000-0000-4000-8000-000000000002";

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
  member: {
    id: ME,
    displayName: "Tristan",
    colour: "#E4572E",
    isGuest: false,
    isBot: false,
    online: true,
    lastPosition: null,
  },
  token: "session-token",
};

function lifecycleWith(api: Partial<ApiClient>) {
  return createSessionLifecycle({
    getApi: async () => api as ApiClient,
    stopTracking: async () => undefined,
    resetStores: () => undefined,
  });
}

beforeEach(() => {
  setActiveSessionStorage(null);
  useActiveSession.setState({ active: null, hydrated: true });
  useAccountStore.getState().set({ available: false, loggedIn: false, me: null, actions: null });
});

describe("linking sessions to the account", () => {
  it("sends the account token on create, and marks the session as linked", async () => {
    const createSession = jest.fn(async () => access);
    await lifecycleWith({ createSession }).create(
      {
        displayName: "Tristan",
        location: { lat: 43, lng: -81 },
        area: { kind: "circle", center: { lat: 43, lng: -81 }, radiusM: 400 },
      },
      "account-token",
    );
    expect(createSession).toHaveBeenCalledWith(expect.anything(), "account-token");
    expect(useActiveSession.getState().active?.linked).toBe(true);
  });

  it("a guest join isn't linked", async () => {
    const joinSession = jest.fn(async () => access);
    await lifecycleWith({ joinSession }).join({ code: "KNK482", displayName: "Sam" }, null);
    expect(useActiveSession.getState().active?.linked).toBeUndefined();
  });

  it("no account token when logged out, or when refreshing it fails", async () => {
    expect(await getAccountToken()).toBeNull();
    useAccountStore.getState().set({
      loggedIn: true,
      actions: {
        login: async () => undefined,
        logout: async () => undefined,
        getToken: async () => Promise.reject(new Error("expired")),
      },
    });
    expect(await getAccountToken()).toBeNull();
  });
});

describe("previous leads", () => {
  it("are marked as past, and today's lead on the same house wins", () => {
    const house = (id: string) => ({
      houseId: id,
      blockId: "1",
      streetId: null,
      centre: [-81.34, 42.95] as [number, number],
      feature: {
        type: "Feature" as const,
        properties: { houseId: id, blockId: "1" },
        geometry: { type: "Polygon" as const, coordinates: [] },
      },
    });
    const leads = placeLeads(
      { c1: { clientId: "c1", memberId: ME, houseId: 1, grade: "B", note: null, createdAt: "", updatedAt: "" } },
      { "1": house("1"), "2": house("2") },
      {
        "1": { houseId: "1", grade: "A", at: "2026-01-01T00:00:00Z" },
        "2": { houseId: "2", grade: "A", at: "2026-01-01T00:00:00Z" },
      },
    );
    expect(leads.map((l) => [l.id, l.grade, l.past ?? false])).toEqual([
      ["c1", "B", false],
      ["past-2", "A", true],
    ]);
  });

  it("say how long ago in plain words", () => {
    const now = Date.parse("2026-11-22T12:00:00Z");
    expect(agoLabel("2026-11-22T08:00:00Z", now)).toBe("today");
    expect(agoLabel("2026-11-19T12:00:00Z", now)).toBe("3 days ago");
    expect(agoLabel("2026-11-01T12:00:00Z", now)).toBe("3 weeks ago");
    expect(agoLabel("2026-03-22T12:00:00Z", now)).toBe("8 months ago");
    expect(agoLabel("2025-10-01T12:00:00Z", now)).toBe("1 year ago");
  });
});
