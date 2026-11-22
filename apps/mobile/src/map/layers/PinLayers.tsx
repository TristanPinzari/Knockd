import { GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import type { FeatureCollection, Point } from "geojson";
import { memo } from "react";
import { COLOURS } from "../constants";
import type { PinProps } from "../geo/pins";
import { BADGE_FONT } from "./styles";

export const PINS_HIT_LAYER_ID = "knockd-pins-dot";

/** Crew pins ("meet up here once done"): a dot in the dropper's colour with its label above. */
function PinLayersBase({ pins }: { pins: FeatureCollection<Point, PinProps> }) {
  return (
    <GeoJSONSource id="knockd-pins" data={pins}>
      <Layer
        id={PINS_HIT_LAYER_ID}
        type="circle"
        style={{
          circleRadius: 10,
          circleColor: ["get", "colour"],
          circleStrokeColor: COLOURS.white,
          circleStrokeWidth: 3,
        }}
      />
      <Layer
        id="knockd-pins-label"
        type="symbol"
        style={{
          textField: ["get", "label"],
          textFont: BADGE_FONT,
          textSize: 13,
          textColor: COLOURS.badgeText,
          textHaloColor: COLOURS.white,
          textHaloWidth: 2,
          textAnchor: "bottom",
          textOffset: [0, -1.2],
          textMaxWidth: 12,
          textAllowOverlap: true,
        }}
      />
    </GeoJSONSource>
  );
}

export const PinLayers = memo(PinLayersBase);
