import { GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import type { Polygon } from "geojson";
import { memo, useMemo } from "react";
import { COLOURS, OUTSKIRTS_FADE_END, OUTSKIRTS_FADE_START, OUTSKIRTS_OPACITY } from "../constants";
import { outskirtsPolygon } from "../geo/outskirts";

/** Work-area dashed brand outline, plus the red-orange outskirts tint when zoomed out. */
function OutskirtsLayerBase({ workArea }: { workArea: Polygon }) {
  const outskirts = useMemo(() => outskirtsPolygon(workArea), [workArea]);
  const outline = useMemo(() => ({ type: "Feature" as const, properties: {}, geometry: workArea }), [workArea]);
  return (
    <>
      <GeoJSONSource id="knockd-outskirts" data={outskirts}>
        <Layer
          id="knockd-outskirts-fill"
          type="fill"
          style={{
            fillColor: COLOURS.brand,
            fillOpacity: [
              "interpolate",
              ["linear"],
              ["zoom"],
              OUTSKIRTS_FADE_START,
              OUTSKIRTS_OPACITY,
              OUTSKIRTS_FADE_END,
              0,
            ],
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="knockd-workarea" data={outline}>
        <Layer
          id="knockd-workarea-line"
          type="line"
          style={{ lineColor: COLOURS.brand, lineWidth: 1.5, lineDasharray: [3, 2], lineOpacity: 0.9 }}
        />
      </GeoJSONSource>
    </>
  );
}

export const OutskirtsLayer = memo(OutskirtsLayerBase);
