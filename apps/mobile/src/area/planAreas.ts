/**
 * The work area for a live session: the bounding box of the claimed blocks, else of all loaded
 * blocks. (Progress itself is drawn from the plan's routes: see src/routes.)
 */
import type { Polygon } from "geojson";
import type { PlanContent } from "@knockd/shared";
import type { BlockInfo } from "./features";

function loadedBlocks(blockIds: readonly number[], blocks: Readonly<Record<string, BlockInfo>>): BlockInfo[] {
  return [...new Set(blockIds)].flatMap((id) => {
    const b = blocks[String(id)];
    return b ? [b] : [];
  });
}

/** memberId -> claimed block ids, in claim order. */
export function claimsByMember(plan: PlanContent | null): ReadonlyMap<string, readonly number[]> {
  const out = new Map<string, number[]>();
  for (const c of plan?.claims ?? []) out.set(c.memberId, [...(out.get(c.memberId) ?? []), c.blockId]);
  return out;
}

/** Axis-aligned bounding rectangle of the polygons, or undefined when there are none. */
export function boundingPolygon(polygons: readonly Polygon[]): Polygon | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polygons) {
    for (const p of poly.coordinates[0] ?? []) {
      minX = Math.min(minX, p[0]!);
      maxX = Math.max(maxX, p[0]!);
      minY = Math.min(minY, p[1]!);
      maxY = Math.max(maxY, p[1]!);
    }
  }
  if (!Number.isFinite(minX)) return undefined;
  const ring = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
  return { type: "Polygon", coordinates: [ring] };
}

export function buildWorkArea(
  plan: PlanContent | null,
  blocks: Readonly<Record<string, BlockInfo>>,
): Polygon | undefined {
  const plannedIds = (plan?.claims ?? []).map((c) => c.blockId);
  const planned = loadedBlocks(plannedIds, blocks).map((b) => b.polygon);
  return boundingPolygon(planned.length > 0 ? planned : Object.values(blocks).map((b) => b.polygon));
}
