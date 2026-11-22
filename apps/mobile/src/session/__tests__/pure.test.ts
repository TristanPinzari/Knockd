import { ApiRequestError, NetworkError, ResponseShapeError } from "../../realtime/errors";
import type { CrewMember } from "../../realtime/stores/crewStore";
import type { ActiveSession } from "../activeSessionStore";
import { buildAreaRequest, DEMO_CENTER, demoPolygon, MAX_RADIUS_M, MIN_RADIUS_M, radiusKmToM } from "../areaInput";
import { isSessionGone, sessionErrorMessage } from "../errorMessages";
import { overtakeCopy, pendingLabel } from "../liveCopy";
import { MOCK_LOBBY_ROWS, toLobbyRows } from "../lobbyCrew";
import { locationNotice } from "../locationNotice";

const apiError = (status: number, code: ApiRequestError["code"] = null) => new ApiRequestError(status, code, "x");

describe("sessionErrorMessage", () => {
  it("explains join failures", () => {
    expect(sessionErrorMessage("join", apiError(404, "session_not_found"))).toMatch(/No session with that code/);
    expect(sessionErrorMessage("join", apiError(409, "session_full"))).toMatch(/full/);
    expect(sessionErrorMessage("join", apiError(410, "session_ended"))).toMatch(/already ended/);
    expect(sessionErrorMessage("join", apiError(400))).toMatch(/Check the code/);
  });

  it("explains simulated crew failures", () => {
    expect(sessionErrorMessage("startSim", apiError(409))).toMatch(/already running/);
    expect(sessionErrorMessage("startSim", apiError(409, "session_full"))).toMatch(/8 people/);
    expect(sessionErrorMessage("startSim", apiError(400))).toMatch(/No houses/);
    expect(sessionErrorMessage("startSim", apiError(403))).toMatch(/Only the host/);
  });

  it("covers create, end and shared cases", () => {
    expect(sessionErrorMessage("create", apiError(400))).toMatch(/area/);
    expect(sessionErrorMessage("end", apiError(403))).toMatch(/Only the host/);
    expect(sessionErrorMessage("leave", apiError(410))).toMatch(/already ended/);
    expect(sessionErrorMessage("create", apiError(429))).toMatch(/Too many/);
    expect(sessionErrorMessage("create", apiError(500))).toMatch(/Could not create/);
    expect(sessionErrorMessage("join", new NetworkError("x"))).toMatch(/offline/);
    expect(sessionErrorMessage("join", new ResponseShapeError("/x", "bad"))).toMatch(/unexpected/);
    expect(sessionErrorMessage("leave", new Error("?"))).toMatch(/Could not leave/);
  });

  it("knows when a session is gone", () => {
    expect(isSessionGone(apiError(410))).toBe(true);
    expect(isSessionGone(apiError(404))).toBe(true);
    expect(isSessionGone(apiError(401))).toBe(true);
    expect(isSessionGone(apiError(500))).toBe(false);
    expect(isSessionGone(new NetworkError("x"))).toBe(false);
  });
});

describe("buildAreaRequest", () => {
  const me = { lat: 43, lng: -81.2 };

  it("clamps the radius to the server range", () => {
    expect(radiusKmToM(1.25)).toBe(1250);
    expect(radiusKmToM(0.05)).toBe(MIN_RADIUS_M);
    expect(radiusKmToM(10)).toBe(MAX_RADIUS_M);
  });

  it("centres the circle on me, or on Byron without permission", () => {
    expect(buildAreaRequest("radius", 1, me)).toEqual({
      location: me,
      area: { kind: "circle", center: me, radiusM: 1000 },
    });
    expect(buildAreaRequest("radius", 1, null).area).toEqual({ kind: "circle", center: DEMO_CENTER, radiusM: 1000 });
  });

  it("sends the demo polygon for suggested and draw", () => {
    for (const mode of ["suggested", "draw"] as const) {
      const req = buildAreaRequest(mode, 1, me);
      expect(req.location).toEqual(me);
      expect(req.area).toEqual({ kind: "polygon", polygon: demoPolygon() });
    }
  });

  it("builds a closed ring around the centre", () => {
    const ring = demoPolygon().coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const lngs = ring.map((p) => p[0]!);
    expect(Math.min(...lngs)).toBeLessThan(DEMO_CENTER.lng);
    expect(Math.max(...lngs)).toBeGreaterThan(DEMO_CENTER.lng);
  });
});

describe("toLobbyRows", () => {
  const member = (id: string, name: string, extra: Partial<CrewMember> = {}): CrewMember => ({
    id,
    name,
    colour: "#1F6FD6",
    initials: name.slice(0, 1),
    isBot: false,
    online: true,
    position: null,
    speedKmh: null,
    lastSeenMs: null,
    ...extra,
  });
  const active: ActiveSession = {
    sessionId: "s",
    token: "t",
    memberId: "me",
    joinCode: "C",
    isAdmin: true,
    displayName: "Zed",
  };

  it("puts me first as host, then everyone by name", () => {
    const rows = toLobbyRows(
      [member("b", "Sam"), member("me", "Zed"), member("a", "Alex (sim)", { isBot: true })],
      active,
    );
    expect(rows.map((r) => r.id)).toEqual(["me", "a", "b"]);
    expect(rows[0]).toMatchObject({ isMe: true, isHost: true });
    expect(rows[1]).toMatchObject({ isBot: true, isHost: false });
  });

  it("is not host when not the admin", () => {
    expect(toLobbyRows([member("me", "Zed")], { ...active, isAdmin: false })[0]?.isHost).toBe(false);
  });

  it("falls back to the mock crew", () => {
    expect(MOCK_LOBBY_ROWS.length).toBeGreaterThan(0);
    expect(MOCK_LOBBY_ROWS.some((r) => r.isMe)).toBe(true);
  });
});

describe("locationNotice", () => {
  it("explains each limited permission", () => {
    expect(locationNotice("blocked", null)).toMatchObject({ openSettings: true });
    expect(locationNotice("denied", null)).toMatchObject({ openSettings: false });
    expect(locationNotice("foreground-only", null)?.message).toMatch(/only while/);
    expect(locationNotice("always", "boom")?.message).toMatch(/Couldn't start/);
  });

  it("stays quiet when tracking works", () => {
    expect(locationNotice("always", null)).toBeNull();
    expect(locationNotice(null, null)).toBeNull();
  });
});

describe("live copy", () => {
  it("labels pending items", () => {
    expect(pendingLabel(0)).toBeNull();
    expect(pendingLabel(1)).toBe("1 update waiting to sync");
    expect(pendingLabel(4)).toBe("4 updates waiting to sync");
  });

  it("writes the passed banner", () => {
    const base = { memberId: "m", name: "Sam", theirLeads: 3, myLeads: 2, at: 0 };
    expect(overtakeCopy(base)).toEqual({
      title: "Sam passed you",
      detail: "1 lead behind. Keep knocking to take it back.",
    });
    expect(overtakeCopy({ ...base, theirLeads: 5 }).detail).toMatch(/^3 leads behind/);
    expect(overtakeCopy({ ...base, theirLeads: 2 }).detail).toMatch(/level/);
  });
});
