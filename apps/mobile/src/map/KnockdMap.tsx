import {
  Camera,
  Map,
  type CameraRef,
  type MapRef,
  type PressEvent,
  type ViewStateChangeEvent,
} from "@maplibre/maplibre-react-native";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from "react";
import type { NativeSyntheticEvent } from "react-native";
import { HOUSES_HIT_LAYER_ID, MAX_ZOOM, MIN_ZOOM } from "./constants";
import { cameraClamp, fitBounds } from "./geo/bounds";
import { buildHouseLayers } from "./geo/houses";
import { buildRouteLayers, onlyMyGroups } from "./geo/routes";
import { leadsToGeoJSON } from "./geo/leads";
import { styleTrails } from "./geo/trails";
import { dispatchHouseGesture, firstHouseId, nextZoom } from "./interactions";
import { HouseLayers } from "./layers/HouseLayers";
import { MemberPin } from "./layers/MemberPin";
import { OutskirtsLayer } from "./layers/OutskirtsLayer";
import { BLOCKS_HIT_LAYER_ID, NOTES_HIT_LAYER_ID, PlanBlocks, PlanLines, PlanNotes } from "./layers/PlanLayers";
import { RouteBadges, RouteLines } from "./layers/RouteLayers";
import { SuggestMarkers, SuggestWalks } from "./layers/SuggestLayers";
import { TrailLayers } from "./layers/TrailLayers";
import type { Bounds, KnockdMapHandle, KnockdMapProps } from "./types";
import { useKnockdStyle } from "./useKnockdStyle";

const toTuple = (b: Bounds): [number, number, number, number] => [b.sw[0], b.sw[1], b.ne[0], b.ne[1]];

export const KnockdMap = forwardRef<KnockdMapHandle, KnockdMapProps>(function KnockdMap(props, ref) {
  const {
    style,
    center,
    zoom,
    workArea,
    routes,
    colours,
    members,
    trails,
    houses,
    leads,
    showCrewPaths,
    plan,
    planBlocks,
    suggest,
    houseHighlights,
    onHousePress,
    onHouseLongPress,
    onPlanTap,
    onZoomChange,
  } = props;
  const mapStyle = useKnockdStyle();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const lastZoom = useRef<number | null>(null);

  // Memoised GeoJSON: rebuilt only when the relevant inputs change identity.
  const myId = useMemo(() => members.find((m) => m.isMe)?.memberId ?? null, [members]);
  const shownRoutes = useMemo(
    () => (showCrewPaths ? routes : onlyMyGroups(routes, myId)),
    [routes, showCrewPaths, myId],
  );
  const centres = useMemo(
    () =>
      Object.fromEntries(
        buildHouseLayers(houses).centres.features.map((f) => [
          f.properties.houseId,
          f.geometry.coordinates as [number, number],
        ]),
      ),
    [houses],
  );
  const routeData = useMemo(() => buildRouteLayers(shownRoutes, colours, centres), [shownRoutes, colours, centres]);
  const houseColours = useMemo(
    () => (houseHighlights ? { ...routeData.houseColours, ...houseHighlights } : routeData.houseColours),
    [routeData.houseColours, houseHighlights],
  );
  const houseData = useMemo(() => buildHouseLayers(houses, houseColours), [houses, houseColours]);
  // With a plan, progress shows as slug trails along the routes; raw GPS trails only without one.
  const hasPlan = routes.groups.length > 0;
  const trailData = useMemo(() => styleTrails(trails, members, showCrewPaths), [trails, members, showCrewPaths]);
  const leadData = useMemo(() => leadsToGeoJSON(leads), [leads]);
  const clamp = useMemo(() => cameraClamp(workArea), [workArea]);
  const fit = useMemo(() => fitBounds(workArea), [workArea]);

  useImperativeHandle(
    ref,
    () => ({
      recenter: (lng, lat, z) => cameraRef.current?.easeTo({ center: [lng, lat], zoom: z, duration: 400 }),
      fitWorkArea: () => fit && cameraRef.current?.fitBounds(toTuple(fit), { duration: 500, easing: "ease" }),
      zoomBy: (delta) => {
        const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (lastZoom.current ?? zoom) + delta));
        cameraRef.current?.zoomTo(target, { duration: 300 });
      },
      unproject: async (points) => {
        const map = mapRef.current;
        if (!map) return [];
        const coords = await Promise.all(points.map(([x, y]) => map.unproject([x, y])));
        return coords.map(([lng, lat]) => ({ lat, lng }));
      },
      getZoom: async () => (await mapRef.current?.getZoom()) ?? lastZoom.current ?? zoom,
    }),
    [fit, zoom],
  );

  const hit = useCallback(
    async (kind: "tap" | "longPress", e: NativeSyntheticEvent<PressEvent>) => {
      const map = mapRef.current;
      if (!map) return;
      const { point, lngLat } = e.nativeEvent;
      if (kind === "tap" && onPlanTap) {
        const [blocks, notes] = await Promise.all([
          planBlocks ? map.queryRenderedFeatures(point, { layers: [BLOCKS_HIT_LAYER_ID] }) : [],
          map.queryRenderedFeatures(point, { layers: [NOTES_HIT_LAYER_ID] }),
        ]);
        const blockId = Number(blocks[0]?.properties?.blockId);
        const noteId = notes[0]?.properties?.id;
        onPlanTap({
          at: { lng: lngLat[0], lat: lngLat[1] },
          blockId: Number.isFinite(blockId) ? blockId : null,
          noteId: typeof noteId === "string" ? noteId : null,
        });
        return;
      }
      const features = await map.queryRenderedFeatures(point, { layers: [HOUSES_HIT_LAYER_ID] });
      dispatchHouseGesture(kind, firstHouseId(features ?? []), { onHousePress, onHouseLongPress });
    },
    [onHousePress, onHouseLongPress, onPlanTap, planBlocks],
  );

  const onRegionDidChange = useCallback(
    (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const z = nextZoom(lastZoom.current, e.nativeEvent.zoom);
      if (z === null) return;
      lastZoom.current = z;
      onZoomChange?.(z);
    },
    [onZoomChange],
  );

  return (
    <Map
      ref={mapRef}
      style={style}
      mapStyle={mapStyle}
      compass={false}
      logo={false}
      attribution
      touchRotate={false}
      touchPitch={false}
      onPress={(e) => void hit("tap", e as NativeSyntheticEvent<PressEvent>).catch(() => undefined)}
      onLongPress={(e) => void hit("longPress", e).catch(() => undefined)}
      onRegionDidChange={onRegionDidChange}
    >
      <Camera
        ref={cameraRef}
        initialViewState={{ center, zoom }}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        maxBounds={clamp ? toTuple(clamp) : undefined}
      />
      {workArea ? <OutskirtsLayer workArea={workArea} /> : null}
      <PlanBlocks plan={plan} blocks={planBlocks} />
      {hasPlan ? null : <TrailLayers data={trailData} />}
      <RouteLines data={routeData} />
      <PlanLines plan={plan} />
      {suggest ? <SuggestWalks data={suggest} /> : null}
      <HouseLayers houses={houseData} leads={leadData} />
      <RouteBadges data={routeData} />
      <PlanNotes plan={plan} />
      {suggest ? <SuggestMarkers data={suggest} /> : null}
      {members.map((m) => (
        <MemberPin key={m.memberId} member={m} />
      ))}
    </Map>
  );
});
