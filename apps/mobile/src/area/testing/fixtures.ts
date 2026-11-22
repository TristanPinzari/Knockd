import type { Lead, PlanContent, SessionAreaRes, SessionStatsRes, Stats } from "@knockd/shared";

type Ring = number[][];

export function rect(x0: number, y0: number, x1: number, y1: number): Ring {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
}

export const blockFeature = (blockId: number, houseCount: number, ring: Ring): unknown => ({
  type: "Feature",
  properties: { blockId, houseCount },
  geometry: { type: "Polygon", coordinates: [ring] },
});

export const houseFeature = (houseId: number, blockId: number, ring: Ring): unknown => ({
  type: "Feature",
  properties: { houseId, blockId, streetId: 1 },
  geometry: { type: "Polygon", coordinates: [ring] },
});

export const streetFeature = (streetId: number): unknown => ({
  type: "Feature",
  properties: { streetId, name: "Byron Baseline Rd", lengthM: 120 },
  geometry: {
    type: "LineString",
    coordinates: [
      [-81.34, 42.95],
      [-81.341, 42.95],
    ],
  },
});

const fc = (features: unknown[]) =>
  ({ type: "FeatureCollection", features }) as SessionAreaRes["cells"][number]["blocks"];

export function cell(
  id: string,
  parts: { blocks?: unknown[]; houses?: unknown[]; streets?: unknown[] },
): SessionAreaRes["cells"][number] {
  return { id, blocks: fc(parts.blocks ?? []), houses: fc(parts.houses ?? []), streets: fc(parts.streets ?? []) };
}

export const MEMBER_A = "11111111-1111-4111-8111-111111111111";
export const MEMBER_B = "22222222-2222-4222-8222-222222222222";

/** A live plan from [memberId, blockId] claims. */
export const plan = (claims: readonly (readonly [string, number])[]): PlanContent => ({
  claims: claims.map(([memberId, blockId]) => ({ memberId, blockId, authorId: memberId })),
  drawings: [],
  notes: [],
});

const baseStats: Stats = {
  streetsWorked: 0,
  streetsPassed: 0,
  blocksCompleted: 0,
  housesCovered: 0,
  leads: { A: 0, B: 0, C: 0 },
  distanceM: 0,
  activeS: 0,
};

export const stats = (covered: Record<string, number>): SessionStatsRes => ({
  crew: baseStats,
  members: Object.entries(covered).map(([memberId, housesCovered]) => ({ ...baseStats, memberId, housesCovered })),
  final: false,
});

export const lead = (clientId: string, houseId: number, grade: Lead["grade"] = "A"): Lead => ({
  clientId,
  memberId: MEMBER_A,
  houseId,
  grade,
  note: null,
  createdAt: "2026-11-21T15:00:00.000Z",
  updatedAt: "2026-11-21T15:00:00.000Z",
});
