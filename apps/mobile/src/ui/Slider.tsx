import { useState } from "react";
import { View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { colors, shadows } from "@/theme";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  accessibilityLabel: string;
  /** How the value is read out, e.g. "60 metres". */
  accessibilityValueText?: string;
}

const TRACK = 6;
const THUMB = 28;
/** The touchable strip is this tall (Apple's minimum is 44), plus HIT_SLOP above and below. */
const TOUCH_HEIGHT = 48;
const HIT_SLOP = { top: 16, bottom: 16, left: 8, right: 8 };

/** Snap to the step and keep within range. */
export function snapSliderValue(raw: number, min: number, max: number, step: number): number {
  const snapped = Math.round((raw - min) / step) * step + min;
  return Math.min(max, Math.max(min, snapped));
}

/** A horizontal slider: drag or tap the track. Pure JS (no native module). */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  accessibilityLabel,
  accessibilityValueText,
}: SliderProps) {
  const [width, setWidth] = useState(0);
  const update = (e: GestureResponderEvent) => {
    if (width <= 0) return;
    const x = Math.min(width, Math.max(0, e.nativeEvent.locationX));
    onChange(snapSliderValue(min + (x / width) * (max - min), min, max, step));
  };

  const fraction = max > min ? (value - min) / (max - min) : 0;
  const left = fraction * width;

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value, text: accessibilityValueText }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) =>
        onChange(snapSliderValue(value + (e.nativeEvent.actionName === "increment" ? step : -step), min, max, step))
      }
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: TOUCH_HEIGHT, justifyContent: "center" }}
      hitSlop={HIT_SLOP}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={update}
      onResponderMove={update}
    >
      <View pointerEvents="none" style={{ height: TRACK, borderRadius: TRACK / 2, backgroundColor: colors.track }}>
        <View style={{ width: left, height: TRACK, borderRadius: TRACK / 2, backgroundColor: colors.brand }} />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: left - THUMB / 2,
          width: THUMB,
          height: THUMB,
          borderRadius: THUMB / 2,
          backgroundColor: colors.bg.card,
          borderWidth: 2,
          borderColor: colors.brand,
          ...shadows.raised,
        }}
      />
    </View>
  );
}
