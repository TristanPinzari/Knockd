import type { LatLng } from "@knockd/shared";

/** One door for one person. */
export interface RouteKnock {
  readonly houseId: string;
  readonly memberId: string;
  /** Distance along the group's route where they reach this door, in metres. */
  readonly alongM: number;
}

/** People who walk one route together, and the doors each of them knocks in order. */
export interface RouteGroup {
  readonly memberIds: readonly string[];
  readonly route: readonly LatLng[];
  /** Every door in walking order. Filter by memberId for one person's own 1st, 2nd, 3rd… door. */
  readonly knocks: readonly RouteKnock[];
}

export interface RoutePlan {
  /** Where every route starts (the car). */
  readonly start: LatLng | null;
  readonly groups: readonly RouteGroup[];
}

export const EMPTY_ROUTE_PLAN: RoutePlan = { start: null, groups: [] };
