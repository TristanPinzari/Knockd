import { EMPTY_AREA, mergeAreaCells } from "../areaModel";
import { placeLeads } from "../leads";
import { boundingPolygon, buildWorkArea } from "../planAreas";
import { blockFeature, cell, houseFeature, lead, MEMBER_A, MEMBER_B, plan, rect } from "../testing/fixtures";

const area = mergeAreaCells(EMPTY_AREA, {
  cells: [
    cell("1_1", {
      blocks: [
        blockFeature(1, 10, rect(0, 0, 1, 1)),
        blockFeature(2, 30, rect(1, 0, 2, 1)),
        blockFeature(3, 5, rect(5, 5, 6, 6)),
      ],
      houses: [houseFeature(100, 1, rect(0.1, 0.1, 0.3, 0.3)), houseFeature(101, 2, rect(1.2, 0.2, 1.4, 0.4))],
    }),
  ],
}).data;

describe("work area bounds", () => {
  it("bounds the claimed blocks only", () => {
    const wa = buildWorkArea(
      plan([
        [MEMBER_A, 1],
        [MEMBER_B, 2],
      ]),
      area.blocks,
    );
    expect(wa?.coordinates[0]).toEqual(rect(0, 0, 2, 1));
  });

  it("falls back to all loaded blocks without claims, and undefined without blocks", () => {
    expect(buildWorkArea(null, area.blocks)?.coordinates[0]).toEqual(rect(0, 0, 6, 6));
    expect(buildWorkArea(plan([]), area.blocks)?.coordinates[0]).toEqual(rect(0, 0, 6, 6));
    expect(buildWorkArea(null, {})).toBeUndefined();
    expect(boundingPolygon([])).toBeUndefined();
  });
});

describe("placeLeads", () => {
  it("places live leads at the house centre and skips unknown houses", () => {
    const leads = placeLeads({ l1: lead("l1", 100, "B"), l2: lead("l2", 555) }, area.houses);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ id: "l1", grade: "B" });
    expect(leads[0]?.lng).toBeCloseTo(0.2);
    expect(leads[0]?.lat).toBeCloseTo(0.2);
  });

  it("adds past leads only for houses without a live lead", () => {
    const past = {
      "100": { houseId: "100", grade: "C" as const, at: "2026-01-01T00:00:00.000Z" },
      "101": { houseId: "101", grade: "A" as const, at: "2026-01-01T00:00:00.000Z" },
    };
    const leads = placeLeads({ l1: lead("l1", 100) }, area.houses, past);
    expect(leads.map((l) => l.id)).toEqual(["l1", "past-101"]);
  });
});
