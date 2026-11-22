/**
 * The route plan combined with everyone's GPS trails: how far each group has got, each person's
 * door numbers, and which doors are done. This is everything the map and the progress bar need.
 */
import type { LatLng } from "@knockd/shared";
import { measure, type MeasuredLine } from "./polyline";
import { routeProgressM } from "./progress";
import type { RouteGroup, RoutePlan } from "./types";

export interface HouseMark {
  readonly memberId: string;
  /** Place in that person's own order, from 1. */
  readonly n: number;
  readonly knocked: boolean;
}

export interface GroupProgress {
  readonly group: RouteGroup;
  readonly line: MeasuredLine;
  /** Furthest any member of the group has got along the route, in metres. */
  readonly progressM: number;
}

export interface RouteProgressView {
  readonly start: LatLng | null;
  readonly groups: readonly GroupProgress[];
  readonly houses: Readonly<Record<string, HouseMark>>;
}

export interface DoorCount {
  readonly knocked: number;
  readonly total: number;
}

export function buildRouteProgress(
  plan: RoutePlan,
  trails: Readonly<Record<string, readonly LatLng[]>>,
): RouteProgressView {
  const houses: Record<string, HouseMark> = {};
  const groups = plan.groups.map((group): GroupProgress => {
    const line = measure(group.route);
    const byMember = new Map(group.memberIds.map((m) => [m, routeProgressM(line, trails[m] ?? [])]));
    const progressM = Math.max(0, ...byMember.values());
    const counts = new Map<string, number>();
    for (const k of group.knocks) {
      const n = (counts.get(k.memberId) ?? 0) + 1;
      counts.set(k.memberId, n);
      houses[k.houseId] = { memberId: k.memberId, n, knocked: (byMember.get(k.memberId) ?? 0) >= k.alongM };
    }
    return { group, line, progressM };
  });
  return { start: plan.start, groups, houses };
}

/** One person's doors knocked so far, out of their own doors in the plan. */
export function doorsFor(view: RouteProgressView, memberId: string): DoorCount {
  const mine = Object.values(view.houses).filter((h) => h.memberId === memberId);
  return { knocked: mine.filter((h) => h.knocked).length, total: mine.length };
}
