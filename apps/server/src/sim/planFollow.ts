/**
 * Bots following the session plan. Using a Suggest option saves one route drawing per group (for
 * its first member) and claims the group's blocks for every member (see suggestionToPlanOps). A
 * bot in such a group walks the group's route and stops at the group's doors along it; in a pair
 * or bigger group, members split the doors by side of the street, like Suggest's rule.
 */
import { sql } from "drizzle-orm";
import { distanceM, type LatLng, type PlanContent, type SimPace } from "@knockd/shared";
import { db } from "../db/client";
import type { House, Stop } from "./routes";

/** Route points are spread to about this far apart, so bots walk smoothly along long straights. */
const POINT_SPACING_M = 12;
/** A door belongs to the route if its house is this close to it (centres sit ~15–35 m from the street). */
const HOUSE_REACH_M = 45;
const STOP_RANGE: Record<SimPace, [number, number]> = { demo: [6, 14], realistic: [40, 90] };

export interface PlanGroup {
  /** The route's member first, then everyone else in the group (sorted). */
  readonly memberIds: readonly string[];
  readonly route: readonly LatLng[];
  readonly blockIds: readonly number[];
}

/**
 * The plan's walking groups: each member route, plus everyone without a route of their own who
 * claims one of that route's blocks. Same rule as the phones use to show progress.
 */
export function planGroups(plan: PlanContent): PlanGroup[] {
  const routes = plan.drawings.filter(
    (d): d is typeof d & { memberId: string } => d.kind === "route" && d.memberId !== null && d.points.length >= 2,
  );
  const leads = new Set(routes.map((r) => r.memberId));
  return routes.map((r) => {
    const blockIds = [...new Set(plan.claims.filter((c) => c.memberId === r.memberId).map((c) => c.blockId))];
    const blocks = new Set(blockIds);
    const mates = [
      ...new Set(
        plan.claims
          .filter((c) => c.memberId !== r.memberId && !leads.has(c.memberId) && blocks.has(c.blockId))
          .map((c) => c.memberId),
      ),
    ].sort();
    return { memberIds: [r.memberId, ...mates], route: r.points, blockIds };
  });
}

/** The route with extra points so no two are more than POINT_SPACING_M apart. */
export function densify(route: readonly LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  route.forEach((p, i) => {
    const prev = route[i - 1];
    if (prev) {
      const steps = Math.floor(distanceM(prev, p) / POINT_SPACING_M);
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        out.push({ lat: prev.lat + (p.lat - prev.lat) * t, lng: prev.lng + (p.lng - prev.lng) * t });
      }
    }
    out.push({ lat: p.lat, lng: p.lng });
  });
  return out;
}

/** Positive when `p` is left of the direction from `a` to `b`, negative when right. */
function sideOf(a: LatLng, b: LatLng, p: LatLng): number {
  const k = Math.cos((a.lat * Math.PI) / 180);
  return (b.lng - a.lng) * k * (p.lat - a.lat) - (b.lat - a.lat) * (p.lng - a.lng) * k;
}

interface Door {
  readonly houseId: number;
  /** Index of the route point the door is knocked from. */
  readonly at: number;
  readonly side: number;
}

/** Each house within reach, at the route point nearest to it. */
export function doorsAlong(points: readonly LatLng[], houses: readonly House[]): Door[] {
  return houses.flatMap((h) => {
    let at = -1;
    let best = HOUSE_REACH_M;
    points.forEach((p, i) => {
      const d = distanceM(p, h);
      if (d <= best) [at, best] = [i, d];
    });
    if (at < 0) return [];
    const a = points[Math.max(0, at - 1)]!;
    const b = points[Math.min(points.length - 1, at + 1)]!;
    return [{ houseId: h.id, at, side: sideOf(a, b, h) >= 0 ? 0 : 1 }];
  });
}

/** Who in the group knocks each door: by side of the street, then taking turns. */
export function splitDoors(doors: readonly Door[], memberIds: readonly string[]): Map<string, Door[]> {
  const byMember = new Map(memberIds.map((m) => [m, [] as Door[]]));
  const ordered = [...doors].sort((x, y) => x.at - y.at);
  const turns = [0, 0];
  for (const door of ordered) {
    const team = memberIds.length === 1 ? memberIds : memberIds.filter((_, i) => i % 2 === door.side);
    const who = team.length ? team[turns[door.side]!++ % team.length]! : memberIds[0]!;
    byMember.get(who)!.push(door);
  }
  return byMember;
}

function toStops(points: readonly LatLng[], doors: readonly Door[], pace: SimPace): Stop[] {
  const [minStop, maxStop] = STOP_RANGE[pace];
  const doorsAt = new Map<number, number[]>();
  for (const d of doors) doorsAt.set(d.at, [...(doorsAt.get(d.at) ?? []), d.houseId]);
  return points.map((p, i) => {
    const houseIds = doorsAt.get(i) ?? [];
    const stopS = houseIds.length ? houseIds.length * (minStop + Math.random() * (maxStop - minStop)) : 0;
    return { lat: p.lat, lng: p.lng, stopS, houseIds };
  });
}

async function housesIn(blockIds: readonly number[]): Promise<House[]> {
  if (blockIds.length === 0) return [];
  return db.execute<House>(sql`
    SELECT id, ST_Y(centroid) AS lat, ST_X(centroid) AS lng
    FROM houses WHERE block_id IN (${sql.join(
      blockIds.map((id) => sql`${id}`),
      sql`, `,
    )})`);
}

/** A walk for every bot that's in one of the plan's groups; bots not in the plan are left out. */
export async function routesFromPlan(
  plan: PlanContent,
  botIds: readonly string[],
  pace: SimPace,
): Promise<Map<string, Stop[]>> {
  const bots = new Set(botIds);
  const routes = new Map<string, Stop[]>();
  for (const group of planGroups(plan)) {
    if (!group.memberIds.some((m) => bots.has(m))) continue;
    const points = densify(group.route);
    const doors = doorsAlong(points, await housesIn(group.blockIds));
    for (const [memberId, mine] of splitDoors(doors, group.memberIds))
      if (bots.has(memberId)) routes.set(memberId, toStops(points, mine, pace));
  }
  return routes;
}
