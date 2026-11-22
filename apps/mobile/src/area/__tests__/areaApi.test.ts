import { ApiRequestError, NetworkError, ResponseShapeError } from "../../realtime/errors";
import { chunkCells, createAreaApi } from "../areaApi";
import { friendlyAreaError } from "../errors";
import { stats } from "../testing/fixtures";

const json = (status: number, body: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

function apiWith(response: Response | Error) {
  const fetch = jest.fn(async (_url: string, _init: RequestInit) => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { fetch, api: createAreaApi({ baseUrl: "https://api.test/", fetch }) };
}

describe("createAreaApi", () => {
  it("sends the cells as a comma list with the session token", async () => {
    const { api, fetch } = apiWith(json(200, { cells: [] }));
    await api.getArea("s 1", "tok", ["1_2", "3_-4"]);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.test/v1/sessions/s%201/area?cells=1_2%2C3_-4");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("validates stats and plan with the shared schemas", async () => {
    await expect(apiWith(json(200, stats({}))).api.getStats("s", "t")).resolves.toMatchObject({ final: false });
    await expect(apiWith(json(200, { plan: { claims: 1 } })).api.getPlan("s", "t")).rejects.toBeInstanceOf(
      ResponseShapeError,
    );
  });

  it("maps API errors and network failures to the shared error classes", async () => {
    const notFound = apiWith(json(404, { error: { code: "not_found", message: "Nope" } }));
    await expect(notFound.api.getLayers("s", "t", ["1_1"])).rejects.toMatchObject({ status: 404, code: "not_found" });
    await expect(apiWith(new TypeError("down")).api.getStats("s", "t")).rejects.toBeInstanceOf(NetworkError);
  });

  it("refuses empty or oversized cell lists", async () => {
    const { api } = apiWith(json(200, { cells: [] }));
    await expect(api.getArea("s", "t", [])).rejects.toBeInstanceOf(RangeError);
    const many = Array.from({ length: 26 }, (_, i) => `${i}_0`);
    await expect(api.getArea("s", "t", many)).rejects.toBeInstanceOf(RangeError);
  });

  it("returns only the session from the snapshot", async () => {
    const session = {
      id: "6f0a8b8e-1f7e-4a8c-9a3e-2f1f1f1f1f1f",
      joinCode: "ABCDEF",
      status: "live",
      startedAt: "2026-11-21T15:00:00.000Z",
      endedAt: null,
      createdByMemberId: "6f0a8b8e-1f7e-4a8c-9a3e-2f1f1f1f1f1e",
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
    };
    const info = await apiWith(json(200, { session, members: [] })).api.getSessionInfo("s", "t");
    expect(info.plannedArea.type).toBe("Polygon");
  });
});

describe("chunkCells", () => {
  it("splits into groups of 25", () => {
    const cells = Array.from({ length: 51 }, (_, i) => `${i}_0`);
    expect(chunkCells(cells).map((c) => c.length)).toEqual([25, 25, 1]);
  });
});

describe("friendlyAreaError", () => {
  it.each([
    [new NetworkError("x"), /offline/i],
    [new ApiRequestError(401, null, "x"), /expired/],
    [new ApiRequestError(410, null, "x"), /ended/],
    [new ApiRequestError(503, null, "x"), /server/],
    [new ApiRequestError(400, null, "x"), /Couldn't/],
    [new ResponseShapeError("/p", "x"), /looked wrong/],
    [new Error("x"), /Couldn't/],
  ])("explains %s", (error, expected) => {
    expect(friendlyAreaError(error)).toMatch(expected);
  });
});
