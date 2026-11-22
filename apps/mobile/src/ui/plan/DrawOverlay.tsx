import { useMemo, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";

/** Finger moves shorter than this (pixels) aren't recorded, to keep strokes small. */
const MIN_STEP_PX = 4;

export type ScreenPoint = readonly [number, number];

interface DrawOverlayProps {
  /** Colour of the line while drawing. */
  readonly colour: string;
  readonly dashed?: boolean;
  /** The eraser: a wide, see-through trail. */
  readonly eraser?: boolean;
  /** The finger lifted: every point of the stroke, in map-view pixels (one point for a tap). */
  readonly onStroke: (points: ScreenPoint[]) => unknown;
}

/** A one-finger gesture that records a stroke: `onPoints` while drawing, `onStroke` on release. */
function strokeResponder(onPoints: (points: ScreenPoint[]) => void, onStroke: (points: ScreenPoint[]) => unknown) {
  let points: ScreenPoint[] = [];
  const add = (x: number, y: number, force = false) => {
    const last = points[points.length - 1];
    if (!force && last && Math.hypot(x - last[0], y - last[1]) < MIN_STEP_PX) return;
    points = [...points, [x, y]];
    onPoints(points);
  };
  const finish = () => {
    const stroke = points;
    points = [];
    onPoints([]);
    if (stroke.length > 0) onStroke(stroke);
  };
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      points = [];
      add(e.nativeEvent.locationX, e.nativeEvent.locationY, true);
    },
    onPanResponderMove: (e) => add(e.nativeEvent.locationX, e.nativeEvent.locationY),
    onPanResponderRelease: finish,
    onPanResponderTerminate: finish,
  });
}

/**
 * Sits over the map while a drawing tool (route, freehand, eraser) is on: one finger draws instead
 * of moving the map. Shows the line under the finger, then hands the points over on release.
 * Switch to the Move tool to move the map.
 */
export function DrawOverlay({ colour, dashed = false, eraser = false, onStroke }: DrawOverlayProps) {
  const [drawn, setDrawn] = useState<ScreenPoint[]>([]);

  // Pass a stable onStroke: a new one rebuilds the responder (fine between strokes, not during one).
  const responder = useMemo(() => strokeResponder(setDrawn, onStroke), [onStroke]);

  return (
    <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
      {drawn.length > 1 ? (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Polyline
            points={drawn.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke={colour}
            strokeOpacity={eraser ? 0.35 : 1}
            strokeWidth={eraser ? 28 : 4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashed ? "8 6" : undefined}
          />
        </Svg>
      ) : null}
    </View>
  );
}
