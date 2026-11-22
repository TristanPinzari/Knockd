import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api";
import { ApiRequestError, NetworkError, ResponseShapeError, classifyFailure } from "./errors";
import { jsonResponse, uuid } from "./testUtils";

const sid = uuid(1);
const make = (fetchImpl: (url: string, init: RequestInit) => Promise<Response>, timeoutMs?: number) =>
  createApiClient({ baseUrl: "https://api.test/", fetch: fetchImpl, timeoutMs });

describe("api client", () => {
  it("sends the bearer token, JSON body and validates the response", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ accepted: 2 }));
    const res = await make(fetchMock).postPings(sid, "tok", [
      { clientId: uuid(2), t: "2026-11-21T15:00:00.000Z", lat: 42.9, lng: -81.3, accuracy: 5 },
    ]);
    expect(res.accepted).toBe(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.test/v1/sessions/${sid}/pings`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string).pings).toHaveLength(1);
  });

  it("adds ?since as ISO for trails and parses tuples", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ trails: [{ memberId: uuid(3), points: [[1, 2, 3]] }] }));
    const res = await make(fetchMock).getTrails(sid, "tok", 1_000);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain("since=1970-01-01T00%3A00%3A01.000Z");
    expect(res.trails[0]?.points[0]).toEqual([1, 2, 3]);
  });

  it("omits since when null and supports messages ?after", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ trails: [], messages: [] }));
    const api = make(fetchMock);
    await api.getTrails(sid, "t", null);
    await api.getMessages(sid, "t", uuid(9));
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).not.toContain("since");
    expect((fetchMock.mock.calls[1] as unknown as [string])[0]).toContain(`after=${uuid(9)}`);
  });

  it("maps error bodies to ApiRequestError", async () => {
    const api = make(async () => jsonResponse({ error: { code: "session_ended", message: "over" } }, 410));
    await expect(api.getSnapshot(sid, "t")).rejects.toMatchObject({
      status: 410,
      code: "session_ended",
      message: "over",
    });
  });

  it("handles non-JSON error bodies", async () => {
    const api = make(async () => new Response("boom", { status: 502 }));
    await expect(api.getSnapshot(sid, "t")).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("throws ResponseShapeError on a bad 2xx body", async () => {
    const api = make(async () => jsonResponse({ nope: true }));
    await expect(api.postPings(sid, "t", [])).rejects.toBeInstanceOf(ResponseShapeError);
    const notJson = make(async () => new Response("<html>", { status: 200 }));
    await expect(notJson.getSnapshot(sid, "t")).rejects.toBeInstanceOf(ResponseShapeError);
  });

  it("wraps fetch failures in NetworkError", async () => {
    const api = make(async () => {
      throw new TypeError("offline");
    });
    await expect(api.getSnapshot(sid, "t")).rejects.toBeInstanceOf(NetworkError);
  });

  it("times out", async () => {
    const api = make(
      (_u, init) => new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted")))),
      10,
    );
    await expect(api.getSnapshot(sid, "t")).rejects.toMatchObject({ message: "Request timed out" });
  });

  it("covers delete/patch/lead/pin/message endpoints", async () => {
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) =>
      init.method === "DELETE" ? new Response(null, { status: 204 }) : jsonResponse({}),
    );
    const api = make(fetchMock);
    await expect(api.deleteLead(sid, "t", uuid(4))).resolves.toBeUndefined();
    await expect(api.deletePin(sid, "t", uuid(5))).resolves.toBeUndefined();
    await expect(
      api.postLead(sid, "t", { clientId: uuid(4), t: "2026-11-21T15:00:00.000Z", houseId: 1, grade: "A" }),
    ).rejects.toBeInstanceOf(ResponseShapeError);
    await expect(api.patchLead(sid, "t", uuid(4), { grade: "B" })).rejects.toBeInstanceOf(ResponseShapeError);
    await expect(api.postPin(sid, "t", { clientId: uuid(5), lat: 1, lng: 1 })).rejects.toBeInstanceOf(
      ResponseShapeError,
    );
    await expect(api.postMessage(sid, "t", { clientId: uuid(6), body: "hi" })).rejects.toBeInstanceOf(
      ResponseShapeError,
    );
    expect(fetchMock.mock.calls.map((c) => c[1].method)).toEqual(["DELETE", "DELETE", "POST", "PATCH", "POST", "POST"]);
  });
});

const sessionAccess = (memberId: string) => ({
  session: {
    id: sid,
    joinCode: "KNK482",
    status: "live",
    startedAt: "2026-11-21T15:00:00.000Z",
    endedAt: null,
    createdByMemberId: memberId,
    plannedArea: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
    loadedMap: null,
  },
  member: {
    id: memberId,
    displayName: "Jas",
    colour: "#1F6FD6",
    isGuest: true,
    isBot: false,
    online: true,
    lastPosition: null,
  },
  token: "session-token",
});

describe("api client: session lifecycle", () => {
  const callOf = (fetchMock: ReturnType<typeof vi.fn>, index = 0) =>
    fetchMock.mock.calls[index] as unknown as [string, RequestInit];

  it("creates a guest session without an Authorization header", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(sessionAccess(uuid(2)), 201));
    const res = await make(fetchMock).createSession({
      displayName: "Jas",
      location: { lat: 42.955, lng: -81.3425 },
      area: { kind: "circle", center: { lat: 42.955, lng: -81.3425 }, radiusM: 1000 },
    });
    expect(res.token).toBe("session-token");
    const [url, init] = callOf(fetchMock);
    expect(url).toBe("https://api.test/v1/sessions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("joins with an optional account token", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(sessionAccess(uuid(3))));
    const res = await make(fetchMock).joinSession({ code: "KNK482", displayName: "Sam" }, "acct");
    expect(res.member.id).toBe(uuid(3));
    const [url, init] = callOf(fetchMock);
    expect(url).toBe("https://api.test/v1/sessions/join");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer acct");
  });

  it("surfaces join errors as ApiRequestError", async () => {
    const api = make(async () => jsonResponse({ error: { code: "session_full", message: "full" } }, 409));
    await expect(api.joinSession({ code: "X", displayName: "Sam" })).rejects.toMatchObject({
      status: 409,
      code: "session_full",
    });
  });

  it("ends, leaves, starts and stops the simulated crew", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) =>
      url.endsWith("/sim") && init.method === "POST"
        ? jsonResponse({ botMemberIds: [uuid(7)] }, 201)
        : new Response(null, { status: 204 }),
    );
    const api = make(fetchMock);
    await expect(api.endSession(sid, "t")).resolves.toBeUndefined();
    await expect(api.leaveSession(sid, "t")).resolves.toBeUndefined();
    await expect(api.startSim(sid, "t", 3, "demo")).resolves.toEqual({ botMemberIds: [uuid(7)] });
    await expect(api.stopSim(sid, "t")).resolves.toBeUndefined();
    const calls = fetchMock.mock.calls.map(
      (c) => `${c[1].method} ${c[0].replace(`https://api.test/v1/sessions/${sid}`, "")}`,
    );
    expect(calls).toEqual(["POST /end", "POST /leave", "POST /sim", "DELETE /sim"]);
    expect(JSON.parse(callOf(fetchMock, 2)[1].body as string)).toEqual({ bots: 3, pace: "demo" });
  });
});

describe("classifyFailure", () => {
  const e = (status: number, code: ApiRequestError["code"] = null) => new ApiRequestError(status, code, "x");
  it("classifies", () => {
    expect(classifyFailure(new NetworkError("x"))).toBe("retry");
    expect(classifyFailure(e(500))).toBe("retry");
    expect(classifyFailure(e(429))).toBe("retry");
    expect(classifyFailure(e(401))).toBe("auth");
    expect(classifyFailure(e(410))).toBe("ended");
    expect(classifyFailure(e(404, "session_not_found"))).toBe("ended");
    expect(classifyFailure(e(400))).toBe("drop");
    expect(classifyFailure(new ResponseShapeError("/x", "bad"))).toBe("drop");
    expect(classifyFailure(new Error("?"))).toBe("retry");
  });
});
