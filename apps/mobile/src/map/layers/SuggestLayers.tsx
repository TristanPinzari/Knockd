import { GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import { memo } from "react";
import type { SuggestGeo } from "@/suggest/suggestView";
import { COLOURS } from "../constants";
import { BADGE_FONT, zoomWidth } from "./styles";
import { useLabelsAnchor } from "../labelsAnchor";

/** The walk from each group's last door to the meeting point: fainter, dotted. */
function SuggestWalksBase({ data }: { data: SuggestGeo }) {
  const below = useLabelsAnchor();
  return (
    <GeoJSONSource id="knockd-suggest-to-meet" data={data.toMeet}>
      <Layer
        id="knockd-suggest-to-meet"
        type="line"
        beforeId={below}
        style={{
          lineColor: ["get", "colour"],
          lineWidth: zoomWidth([14, 2], [17, 4], [19, 6]),
          lineOpacity: 0.45,
          lineDasharray: [0.5, 1.5],
          lineCap: "round",
          lineJoin: "round",
        }}
      />
    </GeoJSONSource>
  );
}

/** The car (where routes start) and the regroup pin, with a label. */
function SuggestMarkersBase({ data }: { data: SuggestGeo }) {
  return (
    <GeoJSONSource id="knockd-suggest-markers" data={data.markers}>
      <Layer
        id="knockd-suggest-marker"
        type="circle"
        style={{
          circleRadius: 9,
          circleColor: ["match", ["get", "kind"], "car", COLOURS.start, COLOURS.brand],
          circleStrokeColor: COLOURS.white,
          circleStrokeWidth: 3,
        }}
      />
      <Layer
        id="knockd-suggest-marker-label"
        type="symbol"
        style={{
          textField: ["get", "label"],
          textFont: BADGE_FONT,
          textSize: 12,
          textColor: COLOURS.badgeText,
          textHaloColor: COLOURS.white,
          textHaloWidth: 2,
          textAnchor: "top",
          textOffset: [0, 1.1],
          textAllowOverlap: true,
        }}
      />
    </GeoJSONSource>
  );
}

export const SuggestWalks = memo(SuggestWalksBase);
export const SuggestMarkers = memo(SuggestMarkersBase);
