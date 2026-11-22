import { METRES_PER_DEG_LAT } from "../constants";
import type { Bounds, LngLat } from "../types";
import type { Polygon } from "geojson";

export function polygonBounds(polygon: Polygon): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of polygon.coordinates) {
    for (const p of ring) {
      const x = p[0] as number;
      const y = p[1] as number;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { sw: [minX, minY], ne: [maxX, maxY] };
}

export function boundsCentre(b: Bounds): LngLat {
  return [(b.sw[0] + b.ne[0]) / 2, (b.sw[1] + b.ne[1]) / 2];
}

/** Longitude scale so that angles look right at this latitude. */
export function lngScale(lat: number): number {
  return Math.cos((lat * Math.PI) / 180);
}

export function metresToLatDeg(m: number): number {
  return m / METRES_PER_DEG_LAT;
}

export function metresToLngDeg(m: number, lat: number): number {
  return m / (METRES_PER_DEG_LAT * lngScale(lat));
}
