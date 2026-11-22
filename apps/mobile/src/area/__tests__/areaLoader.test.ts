import type { CellId } from "@knockd/shared";
import { ApiRequestError, NetworkError } from "../../realtime/errors";
import type { AreaApi } from "../areaApi";
import { createAreaLoader } from "../areaLoader";
import { useAreaStore } from "../areaStore";
import { wantedCells } from "../cellPlanner";
import { blockFeature, cell, MEMBER_A, plan, rect, stats } from "../testing/fixtures";

jest.mock("../../realtime/logger", () => ({ logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn() } }));

const SESSION = "session-1";
const BYRON = { lat: 42.955, lng: -81.3425 };

function fakeApi(overrides: Partial<AreaApi> = {}): jest.Mocked<AreaApi> {
  return {
    getSessionInfo: jest.fn(),
    getArea: jest.fn(async (_s: string, _t: string, cells: readonly CellId[]) => ({
      cells: cells.map((id) => cell(id, { blocks: [blockFeature(1, 4, rect(0, 0, 1, 1))] })),
    })),
    getLayers: jest.fn(async () => ({})),
    getPlan: jest.fn(async () => ({ plan: plan([[MEMBER_A, 1]]) })),
    getStats: jest.fn(async () => stats({ [MEMBER_A]: 1 })),
    ...overrides,
  } as jest.Mocked<AreaApi>;
}

beforeEach(() => {
  useAreaStore.getState().reset();
  useAreaStore.getState().start(SESSION);
});

describe("createAreaLoader.ensureCells", () => {
  it("loads cells around the points, then never refetches them", async () => {
    const api = fakeApi();
    const loader = createAreaLoader({ api, sessionId: SESSION, token: "t", now: () => 0 });
    await loader.ensureCells([BYRON]);
    await loader.ensureCells([BYRON]);
    expect(api.getArea).toHaveBeenCalledTimes(1);
    expect(Object.keys(useAreaStore.getState().area.loadedCells).sort()).toEqual(wantedCells([BYRON]).sort());
    expect(Object.keys(useAreaStore.getState().area.blocks)).toEqual(["1"]);
    expect(api.getLayers).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent requests for the same cells", async () => {
    const api = fakeApi();
    const loader = createAreaLoader({ api, sessionId: SESSION, token: "t", now: () => 0 });
    await Promise.all([loader.ensureCells([BYRON]), loader.ensureCells([BYRON])]);
    expect(api.getArea).toHaveBeenCalledTimes(1);
    expect(useAreaStore.getState().inFlight.size).toBe(0);
  });

  it("splits large requests into chunks of at most 25 cells", async () => {
    const api = fakeApi();
    const loader = createAreaLoader({ api, sessionId: SESSION, token: "t", now: () => 0 });
    const points = Array.from({ length: 10 }, (_, i) => ({ lat: 42.9 + i * 0.05, lng: -81.3 }));
    await loader.ensureCells(points);
    const sizes = api.getArea.mock.calls.map((c) => c[2].length);
    expect(sizes.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(25);
  });

  it("records a friendly error and frees the cells for a later retry", async () => {
    const api = fakeApi({ getArea: jest.fn(async () => Promise.reject(new NetworkError("offline"))) });
    const loader = createAreaLoader({ api, sessionId: SESSION, token: "t", now: () => 5 });
    await loader.ensureCells([BYRON]);
    const s = useAreaStore.getState();
    expect(s.error).toMatch(/offline/i);
    expect(s.inFlight.size).toBe(0);
    expect(Object.values(s.failedAt).every((t) => t === 5)).toBe(true);
    expect(api.getLayers).not.toHaveBeenCalled();
  });

  it("ignores responses that arrive after the session changed", async () => {
    const api = fakeApi();
    const loader = createAreaLoader({ api, sessionId: SESSION, token: "t", now: () => 0 });
    const pending = loader.ensureCells([BYRON]);
    useAreaStore.getState().start("session-2");
    await pending;
    expect(useAreaStore.getState().area.blocks).toEqual({});
  });
});

describe("createAreaLoader plan, stats and session info", () => {
  it("stores the live plan and stats, keeping identity when unchanged", async () => {
    const api = fakeApi();
    const loader = createAreaLoader({ api, sessionId: SESSION, token: "t" });
    await loader.refreshPlan();
    await loader.refreshStats();
    const first = useAreaStore.getState();
    expect(first.plan?.claims.map((c) => c.blockId)).toEqual([1]);
    expect(first.stats?.members[0]?.housesCovered).toBe(1);
    await loader.refreshPlan();
    await loader.refreshStats();
    expect(useAreaStore.getState().plan).toBe(first.plan);
    expect(useAreaStore.getState().stats).toBe(first.stats);
  });

  it("stores the planned area, and a friendly error on failure", async () => {
    const polygon = { type: "Polygon" as const, coordinates: [rect(0, 0, 1, 1)] };
    const ok = fakeApi({ getSessionInfo: jest.fn(async () => ({ plannedArea: polygon }) as never) });
    await createAreaLoader({ api: ok, sessionId: SESSION, token: "t" }).loadSessionInfo();
    expect(useAreaStore.getState().plannedArea).toBe(polygon);

    const bad = fakeApi({
      getStats: jest.fn(async () => Promise.reject(new ApiRequestError(401, "unauthorized", "no"))),
    });
    await createAreaLoader({ api: bad, sessionId: SESSION, token: "t" }).refreshStats();
    expect(useAreaStore.getState().error).toMatch(/expired/);
  });
});
