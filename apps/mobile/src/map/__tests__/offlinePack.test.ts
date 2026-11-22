import {
  circleBounds,
  ensureSessionPack,
  OFFLINE_MARGIN_M,
  planSessionPack,
  type OfflineManagerLike,
} from "../offline";

const S1 = "session-1";
const pack = (id: string, name: string) => ({ id, metadata: { name } });

describe("planSessionPack", () => {
  it("creates the session's pack when there is none", () => {
    expect(planSessionPack([], S1, 400)).toEqual({ name: "knockd-session-1-400", create: true, remove: [] });
  });

  it("keeps an existing pack for the same area", () => {
    expect(planSessionPack([pack("a", "knockd-session-1-400")], S1, 400)).toMatchObject({ create: false, remove: [] });
  });

  it("replaces a smaller pack when the area grew, and drops other sessions' packs", () => {
    const plan = planSessionPack(
      [pack("a", "knockd-session-1-400"), pack("b", "knockd-old-400"), pack("c", "someone-elses-pack")],
      S1,
      650,
    );
    expect(plan).toEqual({ name: "knockd-session-1-650", create: true, remove: ["a", "b"] });
  });
});

describe("circleBounds", () => {
  it("reaches the radius plus the margin each way", () => {
    const b = circleBounds({ lat: 43, lng: -81 }, 400);
    expect((b.ne[1] - 43) * 111_320).toBeCloseTo(400 + OFFLINE_MARGIN_M, 0);
    expect(b.sw[0]).toBeLessThan(-81);
  });
});

describe("ensureSessionPack", () => {
  function fakeManager(existing: { id: string; metadata: Record<string, unknown> }[]) {
    const calls: string[] = [];
    const manager: OfflineManagerLike = {
      getPacks: async () => existing,
      deletePack: async (id) => void calls.push(`delete ${id}`),
      createPack: async (options) => void calls.push(`create ${String(options.metadata?.name)}`),
    };
    return { manager, calls };
  }

  it("deletes old packs, then downloads the new area", async () => {
    const { manager, calls } = fakeManager([pack("a", "knockd-session-1-400")]);
    const result = await ensureSessionPack(
      { sessionId: S1, centre: { lat: 43, lng: -81 }, radiusM: 650, styleUrl: "https://x/style.json" },
      manager,
    );
    expect(result).toBe("created");
    expect(calls).toEqual(["delete a", "create knockd-session-1-650"]);
  });

  it("reports ready straight away when the area is already saved", async () => {
    const { manager, calls } = fakeManager([pack("a", "knockd-session-1-400")]);
    const onProgress = jest.fn();
    await ensureSessionPack(
      { sessionId: S1, centre: { lat: 43, lng: -81 }, radiusM: 400, styleUrl: "https://x/style.json", onProgress },
      manager,
    );
    expect(calls).toEqual([]);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ state: "complete" }));
  });
});
