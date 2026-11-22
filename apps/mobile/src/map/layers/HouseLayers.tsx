import { GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import { memo } from "react";
import { COLOURS, HOUSE_HIT_RADIUS_PX, HOUSE_MIN_ZOOM, HOUSES_HIT_LAYER_ID } from "../constants";
import type { HouseLayers as HouseData } from "../geo/houses";
import type { FeatureCollection, Point } from "geojson";
import { GRADE_RADIUS } from "./styles";

interface Props {
  houses: HouseData;
  leads: FeatureCollection<Point>;
}

/** Houses (white, or filled in the knocker's colour when planned) with grey outline, brand lead dots, and an invisible hit-test layer. */
function HouseLayersBase({ houses, leads }: Props) {
  return (
    <>
      <GeoJSONSource id="knockd-houses" data={houses.squares}>
        <Layer
          id="knockd-houses-fill"
          type="fill"
          minzoom={HOUSE_MIN_ZOOM}
          style={{ fillColor: ["coalesce", ["get", "colour"], COLOURS.houseFill], fillOpacity: 1 }}
        />
        <Layer
          id="knockd-houses-outline"
          type="line"
          minzoom={HOUSE_MIN_ZOOM}
          style={{
            lineColor: ["case", ["to-boolean", ["get", "colour"]], "rgba(0,0,0,0.25)", COLOURS.houseOutline],
            lineWidth: 0.8,
            lineJoin: "round",
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="knockd-house-centres" data={houses.centres}>
        <Layer
          id={HOUSES_HIT_LAYER_ID}
          type="circle"
          minzoom={HOUSE_MIN_ZOOM}
          style={{ circleRadius: HOUSE_HIT_RADIUS_PX, circleColor: "#FFFFFF", circleOpacity: 0.01 }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="knockd-leads" data={leads}>
        <Layer
          id="knockd-leads-dot"
          type="circle"
          style={{
            circleRadius: GRADE_RADIUS,
            circleColor: COLOURS.brand,
            circleStrokeColor: COLOURS.white,
            circleStrokeWidth: 1.5,
          }}
        />
      </GeoJSONSource>
    </>
  );
}

export const HouseLayers = memo(HouseLayersBase);
