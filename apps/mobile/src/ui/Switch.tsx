import { Pressable, View } from "react-native";
import { colors } from "@/theme";

interface SwitchProps {
  value: boolean;
  onValueChange?: (next: boolean) => void;
}

const WIDTH = 44;
const HEIGHT = 26;
const KNOB = 20;

export function Switch({ value, onValueChange }: SwitchProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange?.(!value)}
      style={{
        width: WIDTH,
        height: HEIGHT,
        borderRadius: HEIGHT / 2,
        backgroundColor: value ? colors.ink.primary : colors.border.default,
        padding: 3,
        alignItems: value ? "flex-end" : "flex-start",
        justifyContent: "center",
      }}
    >
      <View style={{ width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: colors.bg.card }} />
    </Pressable>
  );
}
