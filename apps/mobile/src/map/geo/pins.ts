import type { FeatureCollection, Point } from "geojson";
import type { Pin } from "@knockd/shared";

export interface PinProps {
  clientId: string;
  colour: string;
  /** Empty when the pin has no label. */
  label: string;
}

/** Pins for the map, in the colour of whoever dropped them. */
export function pinsToGeoJSON(
  pins: Readonly<Record<string, Pin>>,
  colours: Readonly<Record<string, string>>,
): FeatureCollection<Point, PinProps> {
  return {
    type: "FeatureCollection",
    features: Object.values(pins).map((p) => ({
      type: "Feature",
      properties: { clientId: p.clientId, colour: colours[p.memberId] ?? "#9AA3AD", label: p.label ?? "" },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    })),
  };
}
