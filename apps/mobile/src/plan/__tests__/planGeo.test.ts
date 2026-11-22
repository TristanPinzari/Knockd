import type { Polygon } from "geojson";
import type { PlanContent } from "@knockd/shared";
import { arrowTip, blocksGeo, buildPlanGeo, UNKNOWN_COLOUR } from "../planGeo";

const ME = "11111111-1111-4111-8111-111111111111";
const JAS = "22222222-2222-4222-8222-222222222222";
const square: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-81.343, 42.955],
      [-81.342, 42.955],
      [-81.342, 42.956],
      [-81.343, 42.956],
      [-81.343, 42.955],
    ],
  ],
};
const blocks = { "5": { blockId: "5", polygon: square } };
const colours = { [ME]: "#E4572E", [JAS]: "#2E86AB" };
const line = [
  { lat: 42.955, lng: -81.3425 },
  { lat: 42.9555, lng: -81.3425 },
];

const plan: PlanContent = {
  claims: [
    { blockId: 5, memberId: ME, authorId: ME },
    { blockId: 5, memberId: JAS, authorId: ME },
    { blockId: 6, memberId: ME, authorId: ME }, // not loaded: skipped
  ],
  drawings: [
    { id: "r1", kind: "route", points: line, memberId: ME, colour: null, authorId: ME },
    { id: "r2", kind: "route", points: line, memberId: null, colour: "#8AC926", authorId: ME },
    { id: "f1", kind: "freehand", points: line, memberId: "gone", colour: null, authorId: ME },
  ],
  notes: [{ id: "n1", lat: 42.955, lng: -81.34, text: "Car", memberId: JAS, colour: null, authorId: ME }],
};

describe("buildPlanGeo", () => {
  const geo = buildPlanGeo(plan, blocks, colours);

  it("blocks that belong to a Suggest route aren't filled: the route shows the plan", () => {
    expect(geo.claims.features).toHaveLength(0);
  });

  it("a block claimed by hand is filled in one colour and outlined in the other", () => {
    const byHand = buildPlanGeo({ ...plan, drawings: [] }, blocks, colours);
    expect(byHand.claims.features).toHaveLength(1);
    expect(byHand.claims.features[0]!.properties).toEqual({
      blockId: 5,
      fill: "#E4572E",
      outline: "#2E86AB",
      count: 2,
    });
  });

  it("member routes are left to the route layers; utility routes and freehand are drawn here", () => {
    expect(geo.lines.features.map((f) => [f.properties.id, f.properties.dashed, f.properties.colour])).toEqual([
      ["r2", true, "#8AC926"],
      ["f1", false, UNKNOWN_COLOUR],
    ]);
  });

  it("every route gets an arrow tip at its end", () => {
    expect(geo.arrows.features).toHaveLength(2);
    expect(geo.arrows.features[0]!.geometry.coordinates[1]).toEqual([line[1]!.lng, line[1]!.lat]);
  });

  it("notes are drawn in their member's colour", () => {
    expect(geo.notes.features[0]!.properties).toEqual({ id: "n1", colour: "#2E86AB", text: "Car" });
  });

  it("an empty plan draws nothing", () => {
    const empty = buildPlanGeo(null, blocks, colours);
    expect([empty.claims, empty.lines, empty.arrows, empty.notes].every((c) => c.features.length === 0)).toBe(true);
  });
});

describe("arrowTip", () => {
  it("points the way the line was drawn (north: both sides end up south of the tip)", () => {
    const tip = arrowTip(line)!;
    expect(tip[0]![1]).toBeLessThan(line[1]!.lat);
    expect(tip[2]![1]).toBeLessThan(line[1]!.lat);
    expect(tip[0]![0]).not.toBeCloseTo(tip[2]![0]!, 6);
  });

  it("no arrow for a line with no length", () => {
    expect(arrowTip([line[0]!, line[0]!])).toBeNull();
  });
});

describe("blocksGeo", () => {
  it("gives every loaded block a numeric id to tap", () => {
    expect(blocksGeo(blocks).features[0]!.properties).toEqual({ blockId: 5 });
  });
});
