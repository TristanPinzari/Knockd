/**
 * The session's working area (MOBILE.md "The session area"). Nobody picks it: a session starts as
 * a small circle around the host, and the circle grows whenever anyone walks into its padding, so
 * there's always AREA_PADDING_M of loaded houses ahead of the furthest person. It never shrinks.
 * Users never see it; it decides which houses load and which houses Suggest plans over.
 */
import type { Polygon } from "geojson";
import { distanceM, type LatLng, type SessionAreaInput } from "@knockd/shared";

/** Every session starts with at least this much around the host. */
export const MIN_AREA_RADIUS_M = 400;
/** How far ahead of the furthest person the area always reaches. */
export const AREA_PADDING_M = 250;

const METRES_PER_DEG_LAT = 111_320;
const CIRCLE_STEPS = 64;

export interface StartingArea {
  readonly location: LatLng;
  readonly area: SessionAreaInput;
}

/** What `POST /v1/sessions` gets: a minimum-radius circle around the host. */
export function startingArea(here: LatLng): StartingArea {
  return { location: here, area: { kind: "circle", center: here, radiusM: MIN_AREA_RADIUS_M } };
}

/** The radius after the crew moved: big enough to keep the padding ahead of everyone, never smaller. */
export function growRadiusM(centre: LatLng, currentM: number, points: readonly LatLng[]): number {
  return points.reduce(
    (radius, p) => Math.max(radius, distanceM(centre, p) + AREA_PADDING_M),
    Math.max(currentM, MIN_AREA_RADIUS_M),
  );
}

/** The working area as a polygon, for filtering houses. */
export function circlePolygon(centre: LatLng, radiusM: number, steps: number = CIRCLE_STEPS): Polygon {
  const latDeg = radiusM / METRES_PER_DEG_LAT;
  const lngDeg = radiusM / (METRES_PER_DEG_LAT * Math.cos((centre.lat * Math.PI) / 180));
  const ring = Array.from({ length: steps + 1 }, (_, i): [number, number] => {
    const a = (2 * Math.PI * (i % steps)) / steps;
    return [centre.lng + lngDeg * Math.cos(a), centre.lat + latDeg * Math.sin(a)];
  });
  return { type: "Polygon", coordinates: [ring] };
}
