/**
 * Rebuilds the route view (who walks which route, who knocks which door, in what order) from the
 * shared session plan, so every phone shows the same thing.
 *
 * Applying a Suggest option saves one dashed route drawing per group (for its first member) and a
 * claim on the group's blocks for every member. From that:
 *  - a group = the route's member plus everyone else who claims those blocks and has no route
 *  - its doors = houses in those blocks within reach of the route, each given to the nearest route
 *  - a solo knocks them all; a pair splits by side of the street (Suggest's rule: one side each)
 *  - the order is the order the route reaches them
 */
import type { LatLng, PlanContent } from "@knockd/shared";
import { measure, project, type MeasuredLine } from "./polyline";
import type { RouteGroup, RouteKnock, RoutePlan } from "./types";

/** Houses further than this from every route aren't part of the plan (centres sit ~15–35 m from the street line). */
export const HOUSE_REACH_M = 45;

/** The slice of a house the route view needs. */
export interface PlanHouse {
  readonly houseId: string;
  readonly blockId: string;
  /** [lng, lat] */
  readonly centre: readonly [number, number];
}

interface DraftGroup {
  readonly memberIds: readonly string[];
  readonly route: readonly LatLng[];
  readonly line: MeasuredLine;
  readonly blockIds: ReadonlySet<string>;
}

function draftGroups(plan: PlanContent): DraftGroup[] {
  const routes = plan.drawings.filter(
    (d): d is typeof d & { memberId: string } => d.kind === "route" && d.memberId !== null && d.points.length >= 2,
  );
  const leads = new Set(routes.map((r) => r.memberId));
  const blocksOf = (memberId: string) =>
    new Set(plan.claims.filter((c) => c.memberId === memberId).map((c) => String(c.blockId)));

  return routes.map((r) => {
    const blockIds = blocksOf(r.memberId);
    const mates = [
      ...new Set(
        plan.claims
          .filter((c) => c.memberId !== r.memberId && !leads.has(c.memberId) && blockIds.has(String(c.blockId)))
          .map((c) => c.memberId),
      ),
    ].sort();
    return { memberIds: [r.memberId, ...mates], route: r.points, line: measure(r.points), blockIds };
  });
}

/** Who in the group knocks a door on this side: solos everything, groups split by side, then alternate. */
function knockerFor(memberIds: readonly string[], side: number, indexOnSide: number): string {
  if (memberIds.length === 1) return memberIds[0]!;
  const sideMembers = memberIds.filter((_, i) => i % 2 === (side >= 0 ? 0 : 1));
  return sideMembers[indexOnSide % sideMembers.length]!;
}

export function routePlanFromSharedPlan(
  plan: PlanContent | null,
  houses: Readonly<Record<string, PlanHouse>>,
): RoutePlan {
  const drafts = plan ? draftGroups(plan) : [];
  if (drafts.length === 0) return { start: null, groups: [] };

  // Each house goes to the nearest route among the groups that claim its block.
  const doors = drafts.map(() => [] as { houseId: string; alongM: number; side: number }[]);
  for (const house of Object.values(houses)) {
    const at = { lng: house.centre[0], lat: house.centre[1] };
    let best: { group: number; alongM: number; side: number; offM: number } | null = null;
    drafts.forEach((d, group) => {
      if (!d.blockIds.has(house.blockId)) return;
      const proj = project(d.line, at);
      if (!proj || proj.offM > HOUSE_REACH_M || (best && best.offM <= proj.offM)) return;
      best = { group, alongM: proj.alongM, side: proj.side, offM: proj.offM };
    });
    if (best) {
      const { group, alongM, side } = best;
      doors[group]!.push({ houseId: house.houseId, alongM, side });
    }
  }

  const groups: RouteGroup[] = drafts.map((d, i) => {
    const sorted = [...doors[i]!].sort((a, b) => a.alongM - b.alongM || a.houseId.localeCompare(b.houseId));
    const seenOnSide = { left: 0, right: 0 };
    const knocks: RouteKnock[] = sorted.map((door) => {
      const key = door.side >= 0 ? "left" : "right";
      const memberId = knockerFor(d.memberIds, door.side, seenOnSide[key]);
      seenOnSide[key] += 1;
      return { houseId: door.houseId, memberId, alongM: door.alongM };
    });
    return { memberIds: d.memberIds, route: d.route, knocks };
  });
  return { start: drafts[0]!.route[0] ?? null, groups };
}
