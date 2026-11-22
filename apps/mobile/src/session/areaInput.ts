/** Builds the `area` and `location` for `POST /v1/sessions` from the Choose area screen. */
import type { LatLng, SessionAreaInput } from "@knockd/shared";

/** Byron, London ON: the demo centre used when location permission is not granted. */
export const DEMO_CENTER: LatLng = { lat: 42.955, lng: -81.3425 };

export const MIN_RADIUS_M = 100;
export const MAX_RADIUS_M = 3000;
const METRES_PER_KM = 1000;
/** Half-size of the demo square, in degrees (about 700 m north-south). */
const DEMO_HALF_LAT = 0.0063;
const DEMO_HALF_LNG = 0.0086;

export type AreaMode = "suggested" | "radius" | "draw";

export function radiusKmToM(radiusKm: number): number {
  const metres = Math.round(radiusKm * METRES_PER_KM);
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, metres));
}

/** A closed square around the demo centre. Stands in for the suggested and drawn areas for now. */
export function demoPolygon(center: LatLng = DEMO_CENTER): GeoJSON.Polygon {
  const { lat, lng } = center;
  const ring: [number, number][] = [
    [lng - DEMO_HALF_LNG, lat - DEMO_HALF_LAT],
    [lng + DEMO_HALF_LNG, lat - DEMO_HALF_LAT],
    [lng + DEMO_HALF_LNG, lat + DEMO_HALF_LAT],
    [lng - DEMO_HALF_LNG, lat + DEMO_HALF_LAT],
    [lng - DEMO_HALF_LNG, lat - DEMO_HALF_LAT],
  ];
  return { type: "Polygon", coordinates: [ring] };
}

export interface AreaRequest {
  location: LatLng;
  area: SessionAreaInput;
}

/** `myLocation`: my last fix when permission was granted, else null (falls back to the demo centre). */
export function buildAreaRequest(mode: AreaMode, radiusKm: number, myLocation: LatLng | null): AreaRequest {
  const center = myLocation ?? DEMO_CENTER;
  if (mode === "radius") {
    return { location: center, area: { kind: "circle", center, radiusM: radiusKmToM(radiusKm) } };
  }
  // TODO(area): send the chosen suggested neighbourhood / the drawn corners once those UIs produce geometry.
  return { location: center, area: { kind: "polygon", polygon: demoPolygon() } };
}
