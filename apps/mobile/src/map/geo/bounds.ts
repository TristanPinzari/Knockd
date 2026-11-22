import type { Polygon } from "geojson";
import { BOUNDS_PADDING_RATIO } from "../constants";
import type { Bounds } from "../types";
import { polygonBounds } from "./geometry";

export function padBounds(b: Bounds, ratio: number = BOUNDS_PADDING_RATIO): Bounds {
  const dx = (b.ne[0] - b.sw[0]) * ratio;
  const dy = (b.ne[1] - b.sw[1]) * ratio;
  return { sw: [b.sw[0] - dx, b.sw[1] - dy], ne: [b.ne[0] + dx, b.ne[1] + dy] };
}

/** Bounds that fit the whole work area (with a little breathing room). */
export function fitBounds(workArea: Polygon | undefined): Bounds | undefined {
  return workArea ? padBounds(polygonBounds(workArea), 0.08) : undefined;
}

export function clampPoint(p: [number, number], b: Bounds): [number, number] {
  return [Math.min(Math.max(p[0], b.sw[0]), b.ne[0]), Math.min(Math.max(p[1], b.sw[1]), b.ne[1])];
}
