import { GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import type { FeatureCollection, Polygon } from "geojson";
import { memo } from "react";
import type { PlanGeo } from "@/plan/planGeo";
import { COLOURS } from "../constants";
import { BADGE_FONT, zoomWidth } from "./styles";

export const BLOCKS_HIT_LAYER_ID = "knockd-plan-blocks-hit";
export const NOTES_HIT_LAYER_ID = "knockd-plan-notes-dot";

const LINE_WIDTH = zoomWidth([14, 2], [16, 3.5], [19, 7]);

/** Claimed blocks, under everything else. In planning mode, also every block's outline and tap target. */
function PlanBlocksBase({ plan, blocks }: { plan: PlanGeo; blocks: FeatureCollection<Polygon> | null }) {
  return (
    <>
      {blocks ? (
        <GeoJSONSource id="knockd-plan-blocks" data={blocks}>
          <Layer id={BLOCKS_HIT_LAYER_ID} type="fill" style={{ fillColor: COLOURS.white, fillOpacity: 0.01 }} />
          <Layer
            id="knockd-plan-blocks-outline"
            type="line"
            style={{ lineColor: COLOURS.houseOutline, lineWidth: 1, lineDasharray: [2, 2] }}
          />
        </GeoJSONSource>
      ) : null}
      <GeoJSONSource id="knockd-plan-claims" data={plan.claims}>
        <Layer id="knockd-plan-claims-fill" type="fill" style={{ fillColor: ["get", "fill"], fillOpacity: 0.22 }} />
        <Layer
          id="knockd-plan-claims-outline"
          type="line"
          style={{
            lineColor: ["get", "outline"],
            lineWidth: ["case", [">", ["get", "count"], 1], 4, 2],
            lineOpacity: 0.9,
            lineJoin: "round",
          }}
        />
      </GeoJSONSource>
    </>
  );
}

/** Freehand lines (solid), utility-colour routes (dashed) and every route's arrow tip. */
function PlanLinesBase({ plan }: { plan: PlanGeo }) {
  return (
    <>
      <GeoJSONSource id="knockd-plan-lines" data={plan.lines}>
        <Layer
          id="knockd-plan-lines-solid"
          type="line"
          filter={["!", ["get", "dashed"]]}
          style={{ lineColor: ["get", "colour"], lineWidth: LINE_WIDTH, lineJoin: "round", lineCap: "round" }}
        />
        <Layer
          id="knockd-plan-lines-dashed"
          type="line"
          filter={["get", "dashed"]}
          style={{ lineColor: ["get", "colour"], lineWidth: LINE_WIDTH, lineJoin: "round", lineDasharray: [1.6, 1.2] }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="knockd-plan-arrows" data={plan.arrows}>
        <Layer
          id="knockd-plan-arrows"
          type="line"
          style={{ lineColor: ["get", "colour"], lineWidth: LINE_WIDTH, lineJoin: "round", lineCap: "round" }}
        />
      </GeoJSONSource>
    </>
  );
}

/** Notes: a dot in the note's colour with its text beside it. */
function PlanNotesBase({ plan }: { plan: PlanGeo }) {
  return (
    <GeoJSONSource id="knockd-plan-notes" data={plan.notes}>
      <Layer
        id={NOTES_HIT_LAYER_ID}
        type="circle"
        style={{
          circleRadius: 8,
          circleColor: ["get", "colour"],
          circleStrokeColor: COLOURS.white,
          circleStrokeWidth: 2,
        }}
      />
      <Layer
        id="knockd-plan-notes-text"
        type="symbol"
        style={{
          textField: ["get", "text"],
          textFont: BADGE_FONT,
          textSize: 13,
          textColor: ["get", "colour"],
          textHaloColor: COLOURS.white,
          textHaloWidth: 2,
          textAnchor: "left",
          textOffset: [1, 0],
          textMaxWidth: 12,
          textAllowOverlap: true,
        }}
      />
    </GeoJSONSource>
  );
}

export const PlanBlocks = memo(PlanBlocksBase);
export const PlanLines = memo(PlanLinesBase);
export const PlanNotes = memo(PlanNotesBase);
