import type { MultiPolygon, Polygon } from "geojson";
import type { LatLng, Lead, PlanContent } from "@knockd/shared";
import type { MapMember, TrailCollection } from "@/map/types";
import type { AreaData } from "@/area/areaModel";
import { plannedAreaCentre } from "@/area/cellPlanner";
import { placeLeads } from "@/area/leads";
import { buildWorkArea } from "@/area/planAreas";
import { buildRouteProgress, routePlanFromSharedPlan } from "@/routes";
import { BYRON } from "@/map/constants";
import type { CrewBadge, LiveCrewMember, LiveMapData } from "./types";

/** Zoom for a live session: a few blocks around the session centre. */
export const SESSION_ZOOM = 16;

/**
 * Map pins for every crew member with a position. The server doesn't echo my own pings back, so my
 * pin comes from this phone's GPS (`myFix`) when it has one.
 */
export function toMapMembers(
  crew: Readonly<Record<string, LiveCrewMember>>,
  myMemberId: string | null,
  myFix: LatLng | null = null,
): MapMember[] {
  return Object.values(crew).flatMap((m) => {
    const isMe = m.id === myMemberId;
    const position = (isMe ? myFix : null) ?? m.position;
    if (!position) return [];
    return [
      {
        memberId: m.id,
        name: m.name,
        colour: m.colour,
        initials: m.initials,
        lng: position.lng,
        lat: position.lat,
        speedKmh: m.speedKmh ?? undefined,
        isMe,
      },
    ];
  });
}

export function crewBadges(crew: Readonly<Record<string, LiveCrewMember>>, myMemberId: string | null): CrewBadge[] {
  return Object.values(crew).map((m) => ({
    memberId: m.id,
    initials: m.initials,
    colour: m.colour,
    isMe: m.id === myMemberId,
  }));
}

export function crewColours(crew: Readonly<Record<string, LiveCrewMember>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.values(crew).map((m) => [m.id, m.colour]));
}

/**
 * Initial camera centre: the planned area, else the work area. Null until one is known (the
 * caller then centres the camera on Byron).
 */
export function sessionCentre(
  plannedArea: Polygon | MultiPolygon | null,
  workArea: Polygon | undefined,
): [number, number] | null {
  const c = (plannedArea && plannedAreaCentre(plannedArea)) ?? (workArea ? plannedAreaCentre(workArea) : null);
  return c ? [c.lng, c.lat] : null;
}

export interface SessionMapInput {
  readonly crew: Readonly<Record<string, LiveCrewMember>>;
  readonly myMemberId: string | null;
  readonly trails: TrailCollection;
  /** Every member's GPS points, for progress along their route. */
  readonly trailPoints: Readonly<Record<string, readonly LatLng[]>>;
  readonly area: AreaData;
  readonly plannedArea: Polygon | MultiPolygon | null;
  readonly plan: PlanContent | null;
  readonly leads: Readonly<Record<string, Lead>>;
}

/**
 * Everything for a live session from backend data only (never demo geometry). LiveMap memoises the
 * same parts one by one; this composed version is the reference used in tests.
 */
export function buildSessionMapData(input: SessionMapInput): LiveMapData {
  const workArea = buildWorkArea(input.plan, input.area.blocks);
  return {
    center: sessionCentre(input.plannedArea, workArea) ?? BYRON,
    zoom: SESSION_ZOOM,
    workArea,
    routes: buildRouteProgress(routePlanFromSharedPlan(input.plan, input.area.houses), input.trailPoints),
    colours: crewColours(input.crew),
    crew: crewBadges(input.crew, input.myMemberId),
    members: toMapMembers(input.crew, input.myMemberId),
    trails: input.trails,
    houses: input.area.housesGeoJSON,
    leads: placeLeads(input.leads, input.area.houses, input.area.pastLeads),
  };
}
