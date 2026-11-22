import { View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "@/theme";
import { clamp } from "./format";

interface ProgressBarProps {
  /** 0..1 */
  value: number;
  colour?: string;
  height?: number;
  trackColour?: string;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({
  value,
  colour = colors.crew.blue,
  height = 6,
  trackColour = colors.track,
  style,
}: ProgressBarProps) {
  const pct = clamp(value, 0, 1) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={[{ height, borderRadius: height / 2, backgroundColor: trackColour, overflow: "hidden" }, style]}
    >
      <View style={{ width: `${pct}%`, height, borderRadius: height / 2, backgroundColor: colour }} />
    </View>
  );
}
