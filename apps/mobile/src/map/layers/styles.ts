import type { Expression } from "@maplibre/maplibre-react-native";
import { COLOURS } from "../constants";

/** Zoom-interpolated line width: [zoom, width] stops. */
export function zoomWidth(...stops: [number, number][]): Expression {
  return ["interpolate", ["linear"], ["zoom"], ...stops.flat()];
}

export const modeIs = (mode: string): Expression => ["==", ["get", "mode"], mode];

export const TRAIL_STYLES = {
  knocking: { width: zoomWidth([12, 2], [15, 4], [18, 8]), opacity: 0.95 },
  walking: { width: zoomWidth([12, 1], [15, 1.6], [18, 3]), opacity: 0.8 },
  driving: { width: zoomWidth([12, 0.8], [15, 1.2], [18, 2]), opacity: 0.3 },
} as const;

export const GHOST_OPACITY_FACTOR = 0.45;
export const GRADE_RADIUS = zoomWidth([15, 3.5], [18, 7]);
export const BRAND = COLOURS.brand;

/** Dash and gap lengths for planned routes, in line widths (as in docs/suggest-viewer.html). */
const ROUTE_DASH = 1.6;
const ROUTE_GAP = 1.2;
/** Stripe length for a group's walked (solid) line, in line widths. */
const SLUG_STRIPE = 3;

/**
 * Member `slot` of a `count`-person group: their dash starts after the other members' dashes before
 * them, then waits for the rest (+ the gap), so the line cycles through everyone's colours.
 */
function cycle(slot: number, count: number, dash: number, gap: number): number[] {
  const after = (count - 1 - slot) * dash + gap;
  return slot === 0 ? [dash, after] : [0, slot * dash, dash, after];
}

export const routeDashes = (slot: number, count: number): number[] => cycle(slot, count, ROUTE_DASH, ROUTE_GAP);

/** Solid for a solo; stripes with no gap for a group. Undefined = plain solid line. */
export const slugDashes = (slot: number, count: number): number[] | undefined =>
  count === 1 ? undefined : cycle(slot, count, SLUG_STRIPE, 0);

export const ROUTE_WIDTH = zoomWidth([14, 2], [16, 3.5], [19, 7]);
export const ROUTE_CASING_WIDTH = zoomWidth([14, 4], [16, 6.5], [19, 12]);
export const SLUG_WIDTH = zoomWidth([14, 3.5], [16, 6], [19, 12]);
export const BADGE_RADIUS = zoomWidth([16, 6], [18, 10], [19, 12]);
export const BADGE_TEXT_SIZE = zoomWidth([16, 8], [18, 12], [19, 14]);
/** Door numbers appear from this zoom; house colours show from HOUSE_MIN_ZOOM. */
export const BADGE_MIN_ZOOM = 16;
export const BADGE_FONT = ["Noto Sans Medium"];
