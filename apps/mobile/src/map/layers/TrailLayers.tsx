import { GeoJSONSource, Layer, type FilterSpecification } from "@maplibre/maplibre-react-native";
import type { FeatureCollection, LineString } from "geojson";
import { memo } from "react";
import type { StyledTrailProps } from "../geo/trails";
import { GHOST_OPACITY_FACTOR, modeIs, TRAIL_STYLES } from "./styles";
import type { TrailMode } from "../types";
import { useLabelsAnchor } from "../labelsAnchor";

const MODES: TrailMode[] = ["driving", "walking", "knocking"]; // draw order: thickest on top

function TrailLayersBase({ data }: { data: FeatureCollection<LineString, StyledTrailProps> }) {
  const below = useLabelsAnchor();
  return (
    <GeoJSONSource id="knockd-trails" data={data}>
      {MODES.map((mode) => (
        <Layer
          key={mode}
          id={`knockd-trail-${mode}`}
          type="line"
          beforeId={below}
          filter={modeIs(mode) as unknown as FilterSpecification}
          style={{
            lineColor: ["get", "colour"],
            lineWidth: TRAIL_STYLES[mode].width,
            lineOpacity: [
              "case",
              ["get", "ghost"],
              TRAIL_STYLES[mode].opacity * GHOST_OPACITY_FACTOR,
              TRAIL_STYLES[mode].opacity,
            ],
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      ))}
    </GeoJSONSource>
  );
}

export const TrailLayers = memo(TrailLayersBase);
