/**
 * Suggest on the phone, the pure parts: the house brush, previewing an option with the normal route
 * layers, swapping people between groups, and the "back together ~7:35 pm" time.
 */
import type { FeatureCollection, LineString, Point } from "geojson";
import type { LatLng, SuggestOption } from "@knockd/shared";
import { distanceToLineM } from "@/plan/planOps";
import type { RoutePlan } from "@/routes";

export type BrushMode = "add" | "remove";

/**
 * Houses inside the brush (a circle of `radiusM` dragged along `path`) are added to the selection,
 * or removed from it.
 */
export function brushHouses(
  selected: ReadonlySet<string>,
  houses: Readonly<Record<string, { readonly centre: readonly [number, number] }>>,
  path: readonly LatLng[],
  radiusM: number,
  mode: BrushMode,
): Set<string> {
  const next = new Set(selected);
  if (path.length === 0) return next;
  // Quick box test first: most houses are nowhere near the stroke.
  const lats = path.map((p) => p.lat);
  const lngs = path.map((p) => p.lng);
  const padLat = radiusM / 111_320;
  const padLng = radiusM / (111_320 * Math.cos((lats[0]! * Math.PI) / 180));
  const [minLat, maxLat] = [Math.min(...lats) - padLat, Math.max(...lats) + padLat];
  const [minLng, maxLng] = [Math.min(...lngs) - padLng, Math.max(...lngs) + padLng];
  for (const [id, h] of Object.entries(houses)) {
    const [lng, lat] = h.centre;
    if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;
    const at = { lat, lng };
    // Distance to the stroke itself, not just its points, so a fast swipe doesn't skip houses.
    if (distanceToLineM(at, path) > radiusM) continue;
    if (mode === "add") next.add(id);
    else next.delete(id);
  }
  return next;
}

/** An option in the shape the route layers draw: dashed lines in each group's colours, numbered doors. */
export function optionToRoutePlan(option: SuggestOption, start: LatLng): RoutePlan {
  return {
    start,
    groups: option.groups.map((g) => ({
      memberIds: g.memberIds,
      route: g.route,
      // Not walked yet, so no door is done: every door is "further along" than anyone has got.
      knocks: g.knocks.map((k) => ({ houseId: String(k.houseId), memberId: k.memberId, alongM: Infinity })),
    })),
  };
}

/** Swaps two people everywhere in an option: their groups, their doors, who they help, their buddies. */
export function swapMembers(option: SuggestOption, a: string, b: string): SuggestOption {
  if (a === b) return option;
  const s = (id: string) => (id === a ? b : id === b ? a : id);
  return {
    ...option,
    groups: option.groups.map((g) => ({
      ...g,
      memberIds: g.memberIds.map(s),
      knocks: g.knocks.map((k) => ({ ...k, memberId: s(k.memberId) })),
      ...(g.helpAfter ? { helpAfter: { ...g.helpAfter, memberId: s(g.helpAfter.memberId) } } : {}),
    })),
    ...(option.buddies ? { buddies: option.buddies.map((group) => group.map(s)) } : {}),
  };
}

/** "7:35 pm": the clock time `seconds` from `nowMs`, rounded to 5 minutes (it's an estimate). */
export function clockLabel(nowMs: number, seconds: number): string {
  const step = 5 * 60_000;
  const d = new Date(Math.round((nowMs + seconds * 1000) / step) * step);
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${h % 12 || 12}:${mm} ${h < 12 ? "am" : "pm"}`;
}

/** "1 h 5 min" / "35 min". */
export function durationLabel(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

export interface SuggestGeo {
  /** Each group's walk from its last door to the meeting point (drawn fainter). */
  readonly toMeet: FeatureCollection<LineString, { colour: string }>;
  /** The car and the regroup pin. */
  readonly markers: FeatureCollection<Point, { kind: "car" | "meet"; label: string }>;
}

export function suggestGeo(
  option: SuggestOption | null,
  colours: Readonly<Record<string, string>>,
  car: LatLng | null,
  meet: LatLng | null,
): SuggestGeo {
  const toMeet = (option?.groups ?? []).flatMap((g) =>
    g.toMeet.length >= 2
      ? [
          {
            type: "Feature" as const,
            properties: { colour: colours[g.memberIds[0] ?? ""] ?? "#9AA3AD" },
            geometry: { type: "LineString" as const, coordinates: g.toMeet.map((p) => [p.lng, p.lat]) },
          },
        ]
      : [],
  );
  const marker = (at: LatLng, kind: "car" | "meet", label: string) => ({
    type: "Feature" as const,
    properties: { kind, label },
    geometry: { type: "Point" as const, coordinates: [at.lng, at.lat] },
  });
  const meetAt = meet ?? option?.meetPoint ?? null;
  return {
    toMeet: { type: "FeatureCollection", features: toMeet },
    markers: {
      type: "FeatureCollection",
      features: [
        ...(car ? [marker(car, "car", "Car")] : []),
        ...(meetAt ? [marker(meetAt, "meet", meet ? "Meet" : "Meet here")] : []),
      ],
    },
  };
}

export const EMPTY_SUGGEST_GEO: SuggestGeo = suggestGeo(null, {}, null, null);
