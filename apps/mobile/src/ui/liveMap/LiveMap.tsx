import { forwardRef, useMemo, useState } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { KnockdMap, type KnockdMapHandle } from "@/map";
import type { PlanTap } from "@/map/types";
import type { RouteProgressView } from "@/routes";
import type { SuggestGeo } from "@/suggest/suggestView";
import { blocksGeo, buildPlanGeo } from "@/plan/planGeo";
import { pinsToGeoJSON } from "@/map/geo/pins";
import { usePinsStore } from "@/realtime/stores/pinsStore";
import { useSessionStore } from "@/realtime/stores/sessionStore";
import { useSessionUi } from "@/session/uiStore";
import { buildTeamLayersGeo } from "@/map/geo/teamLayers";

import { buildWorkArea, placeLeads, useAreaStore, useAreaSync } from "@/area";
import { BYRON } from "@/map/constants";
import { useCrewStore, useLeadsStore, useTrailsStore } from "@/realtime";
import { buildRouteProgress, routePlanFromSharedPlan } from "@/routes";
import { useMyLocationStore } from "@/location/myLocationStore";
import { useActiveSession } from "@/session";
import { crewBadges, crewColours, SESSION_ZOOM, sessionCentre, toMapMembers } from "./liveMapData";
import type { LiveMapData } from "./types";

/** Stable empty value, so hiding previous leads doesn't rebuild the leads every render. */
const NO_PAST_LEADS = {};

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
  readonly onPinPress?: (clientId: string) => void;
  readonly onMapLongPress?: (at: { lat: number; lng: number }) => void;
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
  // The loaded team map's layers, minus the ones this person switched off.
  const loadedLayers = useSessionStore((s) => s.loadedMap?.layers);
  const hidden = useSessionUi((s) => s.hiddenLayers);
  const shown = useMemo(() => new Set((loadedLayers ?? []).filter((l) => !hidden.includes(l))), [loadedLayers, hidden]);
  const [openedAt] = useState(Date.now);
  const team = useMemo(
    () => buildTeamLayersGeo(area.team, area.blocks, shown, openedAt),
    [area.team, area.blocks, shown, openedAt],
  );
  const pastLeads = shown.has("leads") ? area.pastLeads : NO_PAST_LEADS;
  const leads = useMemo(() => placeLeads(leadsById, area.houses, pastLeads), [leadsById, area.houses, pastLeads]);
  const planGeo = useMemo(() => buildPlanGeo(plan, area.blocks, colours), [plan, area.blocks, colours]);
  const blocks = useMemo(() => blocksGeo(area.blocks), [area.blocks]);
  const pinsById = usePinsStore((s) => s.pins);
  const pins = useMemo(() => pinsToGeoJSON(pinsById, colours), [pinsById, colours]);

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
      pins,
      team,
    }),
    [
      centre,
      workArea,
      routes,
      colours,
      badges,
      members,
      trails,
      area.housesGeoJSON,
      leads,
      planGeo,
      blocks,
      pins,
      team,
    ],
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
    onPinPress,
    onMapLongPress,
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
      pins={data.pins}
      team={data.team}
      onPinPress={onPinPress}
      onMapLongPress={onMapLongPress}
      onHousePress={onHousePress}
      onHouseLongPress={onHouseLongPress}
      onPlanTap={planning ? onPlanTap : undefined}
    />
  );
});
