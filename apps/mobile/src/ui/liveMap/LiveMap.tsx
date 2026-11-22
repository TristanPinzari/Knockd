import { forwardRef, useMemo } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { KnockdMap, type KnockdMapHandle } from "@/map";
import type { PlanTap } from "@/map/types";
import type { RouteProgressView } from "@/routes";
import type { SuggestGeo } from "@/suggest/suggestView";
import { blocksGeo, buildPlanGeo } from "@/plan/planGeo";
import { buildWorkArea, placeLeads, useAreaStore, useAreaSync } from "@/area";
import { BYRON } from "@/map/constants";
import { useCrewStore, useLeadsStore, useTrailsStore } from "@/realtime";
import { buildRouteProgress, routePlanFromSharedPlan } from "@/routes";
import { useMyLocationStore } from "@/location/myLocationStore";
import { useActiveSession } from "@/session";
import { crewBadges, crewColours, SESSION_ZOOM, sessionCentre, toMapMembers } from "./liveMapData";
import type { LiveMapData } from "./types";

export interface LiveMapProps {
  readonly data: LiveMapData;
  /** Remounts the map when it changes (KnockdMap only reads `center` initially). */
  readonly mapKey: string;
  readonly crewOn: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly onHousePress?: (houseId: string) => void;
  readonly onHouseLongPress?: (houseId: string) => void;
  /** Planning mode: shows every block and sends taps to `onPlanTap`. */
  readonly planning?: boolean;
  readonly onPlanTap?: (tap: PlanTap) => void;
  /** Suggest preview: drawn instead of the plan's routes. */
  readonly routesOverride?: RouteProgressView | null;
  readonly suggest?: SuggestGeo;
  readonly houseHighlights?: Readonly<Record<string, string>>;
}

export interface LiveMapState {
  readonly data: LiveMapData;
  readonly mapKey: string;
}

/** Colours keyed by a stable string so position updates don't rebuild the route view. */
function useCrewColours(): Readonly<Record<string, string>> {
  const crew = useCrewStore((s) => s.members);
  const key = Object.values(crew)
    .map((m) => `${m.id}:${m.colour}`)
    .join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => crewColours(crew), [key]);
}

/** Live session data from the backend stores. Each part only changes identity when its inputs do. */
function useSessionMapData(myMemberId: string | null): LiveMapData {
  const crew = useCrewStore((s) => s.members);
  const trails = useTrailsStore((s) => s.trailsGeoJSON);
  const trailPoints = useTrailsStore((s) => s.pointsByMember);
  const leadsById = useLeadsStore((s) => s.leads);
  const area = useAreaStore((s) => s.area);
  const plannedArea = useAreaStore((s) => s.plannedArea);
  const plan = useAreaStore((s) => s.plan);
  const colours = useCrewColours();

  const workArea = useMemo(() => buildWorkArea(plan, area.blocks), [plan, area.blocks]);
  const centre = useMemo(() => sessionCentre(plannedArea, workArea) ?? BYRON, [plannedArea, workArea]);
  const routePlan = useMemo(() => routePlanFromSharedPlan(plan, area.houses), [plan, area.houses]);
  const routes = useMemo(() => buildRouteProgress(routePlan, trailPoints), [routePlan, trailPoints]);
  const myFix = useMyLocationStore((s) => s.fix);
  const myPosition = useMemo(() => (myFix ? { lat: myFix.lat, lng: myFix.lng } : null), [myFix]);
  const members = useMemo(() => toMapMembers(crew, myMemberId, myPosition), [crew, myMemberId, myPosition]);
  const badges = useMemo(() => crewBadges(crew, myMemberId), [colours, myMemberId]); // eslint-disable-line react-hooks/exhaustive-deps
  const leads = useMemo(
    () => placeLeads(leadsById, area.houses, area.pastLeads),
    [leadsById, area.houses, area.pastLeads],
  );
  const planGeo = useMemo(() => buildPlanGeo(plan, area.blocks, colours), [plan, area.blocks, colours]);
  const blocks = useMemo(() => blocksGeo(area.blocks), [area.blocks]);

  return useMemo(
    () => ({
      center: centre,
      zoom: SESSION_ZOOM,
      workArea,
      routes,
      colours,
      crew: badges,
      members,
      trails,
      houses: area.housesGeoJSON,
      leads,
      plan: planGeo,
      blocks,
    }),
    [centre, workArea, routes, colours, badges, members, trails, area.housesGeoJSON, leads, planGeo, blocks],
  );
}

/**
 * Everything the Live map screen draws: only backend data (houses, plan routes, leads, crew,
 * trails). Without an active session it's an empty map centred on Byron.
 */
export function useLiveMapData(): LiveMapState {
  const active = useActiveSession((s) => s.active);
  useAreaSync(active);
  const sessionData = useSessionMapData(active?.memberId ?? null);
  const centreKnown = useAreaStore((s) => s.plannedArea !== null);
  return {
    data: sessionData,
    mapKey: active ? `${active.sessionId}:${centreKnown ? "centred" : "pending"}` : "none",
  };
}

export const LiveMap = forwardRef<KnockdMapHandle, LiveMapProps>(function LiveMap(
  {
    data,
    mapKey,
    crewOn,
    style,
    onHousePress,
    onHouseLongPress,
    planning = false,
    onPlanTap,
    routesOverride,
    suggest,
    houseHighlights,
  },
  ref,
) {
  return (
    <KnockdMap
      key={mapKey}
      ref={ref}
      style={style ?? StyleSheet.absoluteFill}
      center={data.center}
      zoom={data.zoom}
      workArea={data.workArea}
      routes={routesOverride ?? data.routes}
      colours={data.colours}
      members={data.members}
      trails={data.trails}
      houses={data.houses}
      leads={data.leads}
      showCrewPaths={crewOn}
      plan={data.plan}
      planBlocks={planning ? data.blocks : null}
      suggest={suggest}
      houseHighlights={houseHighlights}
      onHousePress={onHousePress}
      onHouseLongPress={onHouseLongPress}
      onPlanTap={planning ? onPlanTap : undefined}
    />
  );
});
