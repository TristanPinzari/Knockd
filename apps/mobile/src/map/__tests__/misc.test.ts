import { firstHouseId, dispatchHouseGesture, nextZoom, LEAD_GESTURE } from "../interactions";
import { clampZoomRange, createOfflinePack, estimateTileCount, type OfflineManagerLike } from "../offline";
import { loadThemedStyle, resetStyleCache, styleUrl } from "../useKnockdStyle";
import { fixtureStyle } from "../testing/fixtures";

const feat = (props: object) => ({
  type: "Feature" as const,
  properties: props,
  geometry: { type: "Point" as const, coordinates: [0, 0] },
});

describe("interactions", () => {
  it("finds the first house id in hit-test results", () => {
    expect(firstHouseId([feat({}), feat({ houseId: 12 })])).toBe("12");
    expect(firstHouseId([])).toBeNull();
  });
  it("routes tap and long-press to the right callback", () => {
    const onHousePress = jest.fn();
    const onHouseLongPress = jest.fn();
    expect(dispatchHouseGesture("tap", "a", { onHousePress, onHouseLongPress })).toBe(true);
    expect(dispatchHouseGesture("longPress", "b", { onHousePress, onHouseLongPress })).toBe(true);
    expect(onHousePress).toHaveBeenCalledWith("a");
    expect(onHouseLongPress).toHaveBeenCalledWith("b");
    expect(dispatchHouseGesture("tap", null, { onHousePress })).toBe(false);
    expect(dispatchHouseGesture("longPress", "c", { onHousePress })).toBe(false);
  });
  it("exposes the lead gesture switch", () => expect(LEAD_GESTURE).toBe("longPress"));
  it("only reports meaningful zoom changes", () => {
    expect(nextZoom(null, 14.123)).toBe(14.12);
    expect(nextZoom(14.12, 14.124)).toBeNull();
    expect(nextZoom(14.12, 15)).toBe(15);
  });
});

describe("offline", () => {
  const bounds = { sw: [-81.36, 42.94] as [number, number], ne: [-81.32, 42.97] as [number, number] };
  it("clamps zoom range, defaulting to z12-z17", () => {
    expect(clampZoomRange()).toEqual([12, 17]);
    expect(clampZoomRange(17, 12)).toEqual([12, 17]);
    expect(clampZoomRange(-3, 40)).toEqual([0, 22]);
  });
  it("estimates more tiles for deeper zooms", () => {
    expect(estimateTileCount(bounds, 12, 12)).toBeGreaterThanOrEqual(1);
    expect(estimateTileCount(bounds, 12, 17)).toBeGreaterThan(estimateTileCount(bounds, 12, 14));
  });
  it("creates a pack and reports progress and errors", async () => {
    const createPack = jest.fn<
      ReturnType<OfflineManagerLike["createPack"]>,
      Parameters<OfflineManagerLike["createPack"]>
    >(async (_o, onProgress, onError) => {
      onProgress({}, { percentage: 50, completedResourceCount: 5, requiredResourceCount: 10 });
      onProgress({}, { percentage: 100, completedResourceCount: 10, requiredResourceCount: 10 });
      onError({}, { message: "boom" });
      return {};
    });
    const onProgress = jest.fn();
    const onError = jest.fn();
    await createOfflinePack(
      { name: "byron", bounds, styleUrl: "https://x/style.json", onProgress, onError },
      { createPack },
    );
    expect(createPack.mock.calls[0]![0]).toMatchObject({
      bounds: [-81.36, 42.94, -81.32, 42.97],
      minZoom: 12,
      maxZoom: 17,
    });
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      percentage: 50,
      completedTiles: 5,
      requiredTiles: 10,
      state: "active",
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, expect.objectContaining({ state: "complete" }));
    expect(onError).toHaveBeenCalledWith("boom");
  });
});

describe("style loading", () => {
  beforeEach(resetStyleCache);
  const ok = (body: unknown) =>
    jest.fn(async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response);
  it("builds the style URL from EXPO_PUBLIC_API_URL", () => {
    expect(styleUrl()).toMatch(/\/tiles\/style\.json$/);
  });
  it("fetches, themes and caches the style", async () => {
    const f = ok(fixtureStyle);
    const s1 = await loadThemedStyle("https://x/style.json", f as unknown as typeof fetch);
    const s2 = await loadThemedStyle("https://x/style.json", f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
    expect(s1).toBe(s2);
    expect(JSON.parse(s1).layers[0].paint["background-color"]).toBe("#F6F7F9");
  });
  it("rejects bad responses and does not cache the failure", async () => {
    const bad = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response);
    await expect(loadThemedStyle("u", bad as unknown as typeof fetch)).rejects.toThrow("500");
    await expect(loadThemedStyle("u", ok({ nope: 1 }) as unknown as typeof fetch)).rejects.toThrow("no layers");
  });
});
