import { EMPTY_AREA, mergeAreaCells, mergePastLeads } from "../areaModel";
import { parseHouses } from "../features";
import { blockFeature, cell, houseFeature, rect, streetFeature } from "../testing/fixtures";

const blockRing = rect(-81.344, 42.954, -81.342, 42.956);

describe("mergeAreaCells", () => {
  it("dedupes streets and blocks that appear in two cells", () => {
    // Arrange
    const res = {
      cells: [
        cell("4295_-8135", { blocks: [blockFeature(7, 12, blockRing)], streets: [streetFeature(3)] }),
        cell("4295_-8134", { blocks: [blockFeature(7, 12, blockRing)], streets: [streetFeature(3)] }),
      ],
    };

    // Act
    const { data } = mergeAreaCells(EMPTY_AREA, res);

    // Assert
    expect(Object.keys(data.blocks)).toEqual(["7"]);
    expect(Object.keys(data.streets)).toEqual(["3"]);
    expect(data.loadedCells).toEqual({ "4295_-8135": true, "4295_-8134": true });
  });

  it("indexes houses by id with their centre and string ids for the map", () => {
    const res = { cells: [cell("a_b", { houses: [houseFeature(41, 7, rect(-81.3, 42.9, -81.2, 43.0))] })] };
    const { data } = mergeAreaCells(EMPTY_AREA, res);
    const house = data.houses["41"]!;
    expect(house.blockId).toBe("7");
    expect(house.centre[0]).toBeCloseTo(-81.25);
    expect(house.centre[1]).toBeCloseTo(42.95);
    expect(data.housesGeoJSON.features[0]?.properties).toEqual({ houseId: "41", blockId: "7" });
  });

  it("keeps the same objects when nothing new arrives", () => {
    const first = mergeAreaCells(EMPTY_AREA, {
      cells: [cell("1_1", { houses: [houseFeature(1, 7, blockRing)] })],
    }).data;
    const second = mergeAreaCells(first, { cells: [cell("1_1", { houses: [houseFeature(1, 7, blockRing)] })] }).data;
    expect(second.houses).toBe(first.houses);
    expect(second.housesGeoJSON).toBe(first.housesGeoJSON);
    expect(second.blocks).toBe(first.blocks);
  });

  it("skips malformed features and counts them", () => {
    const bad = { type: "Feature", properties: { blockId: "x" }, geometry: { type: "Point", coordinates: [0, 0] } };
    const { data, skipped } = mergeAreaCells(EMPTY_AREA, {
      cells: [cell("1_1", { blocks: [bad, blockFeature(2, 3, blockRing)] })],
    });
    expect(skipped).toBe(1);
    expect(Object.keys(data.blocks)).toEqual(["2"]);
  });

  it("does not mutate its input", () => {
    const before = JSON.stringify(EMPTY_AREA);
    mergeAreaCells(EMPTY_AREA, { cells: [cell("1_1", { blocks: [blockFeature(2, 3, blockRing)] })] });
    expect(JSON.stringify(EMPTY_AREA)).toBe(before);
  });
});

describe("mergePastLeads", () => {
  it("keeps the latest lead per house", () => {
    const data = mergePastLeads(EMPTY_AREA, {
      leads: [
        { houseId: 5, grade: "C", note: null, at: "2026-10-01T10:00:00.000Z" },
        { houseId: 5, grade: "A", note: null, at: "2026-11-01T10:00:00.000Z" },
        { houseId: 5, grade: "B", note: null, at: "2026-09-01T10:00:00.000Z" },
      ],
    });
    expect(data.pastLeads["5"]?.grade).toBe("A");
  });

  it("returns the same data when the layers are empty", () => {
    expect(mergePastLeads(EMPTY_AREA, {})).toBe(EMPTY_AREA);
  });
});

describe("parseHouses", () => {
  it("rejects houses without a block id", () => {
    const f = { type: "Feature", properties: { houseId: 1 }, geometry: { type: "Polygon", coordinates: [blockRing] } };
    expect(parseHouses([f]).skipped).toBe(1);
  });
});
