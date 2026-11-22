import type { Feature, Polygon } from "geojson";

const WORLD_RING = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

/** World rectangle with the work area punched out (a hole), for the outskirts tint. */
export function outskirtsPolygon(workArea: Polygon): Feature<Polygon> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [WORLD_RING, workArea.coordinates[0] ?? []] },
  };
}
