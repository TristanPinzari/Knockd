import { GeoJSONSource, Layer, type FilterSpecification } from "@maplibre/maplibre-react-native";
import { memo, useMemo } from "react";
import { COLOURS } from "../constants";
import { stripeKinds, type RouteLayerData } from "../geo/routes";
import {
  BADGE_FONT,
  BADGE_MIN_ZOOM,
  BADGE_RADIUS,
  BADGE_TEXT_SIZE,
  ROUTE_CASING_WIDTH,
  ROUTE_WIDTH,
  routeDashes,
  SLUG_WIDTH,
  slugDashes,
  zoomWidth,
} from "./styles";

const stripeIs = (slot: number, count: number) =>
  ["all", ["==", ["get", "slot"], slot], ["==", ["get", "count"], count]] as unknown as FilterSpecification;

interface LinesProps {
  data: RouteLayerData;
}

/** Planned routes (casing + dashes in each member's colour), slug trails on top, and the car. */
function RouteLinesBase({ data }: LinesProps) {
  const todoKinds = useMemo(() => stripeKinds(data.todo), [data.todo]);
  const doneKinds = useMemo(() => stripeKinds(data.done), [data.done]);
  return (
    <>
      <GeoJSONSource id="knockd-route-casing" data={data.casing}>
        <Layer
          id="knockd-route-casing"
          type="line"
          style={{
            lineColor: COLOURS.routeCasing,
            lineWidth: ROUTE_CASING_WIDTH,
            lineOpacity: 0.9,
            lineOffset: ["get", "offset"],
            lineJoin: "round",
            lineCap: "round",
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="knockd-route-todo" data={data.todo}>
        {todoKinds.map(({ slot, count }) => (
          <Layer
            key={`${slot}/${count}`}
            id={`knockd-route-todo-${slot}-${count}`}
            type="line"
            filter={stripeIs(slot, count)}
            style={{
              lineColor: ["get", "colour"],
              lineWidth: ROUTE_WIDTH,
              lineOffset: ["get", "offset"],
              lineDasharray: routeDashes(slot, count),
              lineJoin: "round",
            }}
          />
        ))}
      </GeoJSONSource>
      <GeoJSONSource id="knockd-route-done" data={data.done}>
        {doneKinds.map(({ slot, count }) => {
          const dashes = slugDashes(slot, count);
          return (
            <Layer
              key={`${slot}/${count}`}
              id={`knockd-route-done-${slot}-${count}`}
              type="line"
              filter={stripeIs(slot, count)}
              style={{
                lineColor: ["get", "colour"],
                lineWidth: SLUG_WIDTH,
                lineOffset: ["get", "offset"],
                lineJoin: "round",
                lineCap: dashes ? "butt" : "round",
                ...(dashes ? { lineDasharray: dashes } : {}),
              }}
            />
          );
        })}
      </GeoJSONSource>
      <GeoJSONSource id="knockd-route-start" data={data.start}>
        <Layer
          id="knockd-route-start"
          type="circle"
          style={{
            circleRadius: 7,
            circleColor: COLOURS.start,
            circleStrokeColor: COLOURS.routeCasing,
            circleStrokeWidth: 2,
          }}
        />
      </GeoJSONSource>
    </>
  );
}

/**
 * A disc on every planned door: plain, ringed in the knocker's colour, filled once they've passed it.
 * Plus a "U" badge wherever a route turns back on itself.
 */
function RouteBadgesBase({ data }: LinesProps) {
  return (
    <>
      <GeoJSONSource id="knockd-route-uturns" data={data.uTurns}>
        <Layer
          id="knockd-route-uturn"
          type="circle"
          style={{
            circleRadius: zoomWidth([14, 7], [17, 10], [19, 13]),
            circleColor: COLOURS.badgeFill,
            circleStrokeColor: ["get", "colour"],
            circleStrokeWidth: 3,
          }}
        />
        <Layer
          id="knockd-route-uturn-label"
          type="symbol"
          style={{
            textField: "U",
            textFont: BADGE_FONT,
            textSize: zoomWidth([14, 9], [17, 12], [19, 15]),
            textColor: ["get", "colour"],
            textAllowOverlap: true,
            textIgnorePlacement: true,
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="knockd-route-badges" data={data.badges}>
        <Layer
          id="knockd-route-badge"
          type="circle"
          minzoom={BADGE_MIN_ZOOM}
          style={{
            circleRadius: BADGE_RADIUS,
            circleColor: ["case", ["get", "knocked"], ["get", "colour"], COLOURS.badgeFill],
            circleStrokeColor: ["case", ["get", "knocked"], COLOURS.badgeFill, ["get", "colour"]],
            circleStrokeWidth: 2,
          }}
        />
        <Layer
          id="knockd-route-badge-number"
          type="symbol"
          minzoom={BADGE_MIN_ZOOM}
          style={{
            textField: ["to-string", ["get", "n"]],
            textFont: BADGE_FONT,
            textSize: BADGE_TEXT_SIZE,
            textColor: ["case", ["get", "knocked"], COLOURS.white, COLOURS.badgeText],
            textAllowOverlap: true,
            textIgnorePlacement: true,
          }}
        />
      </GeoJSONSource>
    </>
  );
}

export const RouteLines = memo(RouteLinesBase);
export const RouteBadges = memo(RouteBadgesBase);
