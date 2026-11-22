import { GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import { memo } from "react";
import type { TeamLayersGeo } from "../geo/teamLayers";
import { COLOURS } from "../constants";
import { BADGE_FONT, zoomWidth } from "./styles";

/** Lead-rate block colours and past coverage: under today's plan and routes. */
function TeamUnderBase({ data }: { data: TeamLayersGeo }) {
  return (
    <>
      <GeoJSONSource id="knockd-team-lead-rate" data={data.leadRate}>
        <Layer id="knockd-team-lead-rate" type="fill" style={{ fillColor: ["get", "colour"], fillOpacity: 0.28 }} />
      </GeoJSONSource>
      <GeoJSONSource id="knockd-team-coverage" data={data.coverage}>
        <Layer
          id="knockd-team-coverage"
          type="line"
          style={{
            lineColor: COLOURS.badgeText,
            lineOpacity: ["get", "opacity"],
            lineWidth: ["get", "width"],
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="knockd-team-highlight-areas" data={data.highlightAreas}>
        <Layer
          id="knockd-team-highlight-area-fill"
          type="fill"
          style={{ fillColor: ["get", "colour"], fillOpacity: 0.12 }}
        />
        <Layer
          id="knockd-team-highlight-area-line"
          type="line"
          style={{ lineColor: ["get", "colour"], lineWidth: 3, lineOpacity: 0.7, lineJoin: "round" }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="knockd-team-highlight-lines" data={data.highlightLines}>
        <Layer
          id="knockd-team-highlight-line"
          type="line"
          style={{
            lineColor: ["get", "colour"],
            lineWidth: zoomWidth([14, 6], [17, 14], [19, 22]),
            lineOpacity: 0.4,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      </GeoJSONSource>
    </>
  );
}

/** The web's team notes: a small dark dot with the text, above everything but people. */
function TeamNotesBase({ data }: { data: TeamLayersGeo }) {
  return (
    <GeoJSONSource id="knockd-team-notes" data={data.notes}>
      <Layer
        id="knockd-team-note-dot"
        type="circle"
        style={{
          circleRadius: 6,
          circleColor: COLOURS.badgeText,
          circleStrokeColor: COLOURS.white,
          circleStrokeWidth: 2,
        }}
      />
      <Layer
        id="knockd-team-note-text"
        type="symbol"
        style={{
          textField: ["get", "text"],
          textFont: BADGE_FONT,
          textSize: 12,
          textColor: COLOURS.badgeText,
          textHaloColor: COLOURS.white,
          textHaloWidth: 2,
          textAnchor: "left",
          textOffset: [0.9, 0],
          textMaxWidth: 12,
        }}
      />
    </GeoJSONSource>
  );
}

export const TeamUnder = memo(TeamUnderBase);
export const TeamNotes = memo(TeamNotesBase);
