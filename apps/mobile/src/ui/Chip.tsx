import { Pressable } from "react-native";
import { colors, pill } from "@/theme";
import { Text } from "./Text";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  height?: number;
}

export function Chip({ label, selected = false, onPress, height = 36 }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        height,
        borderRadius: pill(height),
        paddingHorizontal: 16,
        justifyContent: "center",
        backgroundColor: selected ? colors.ink.primary : colors.bg.card,
        borderWidth: 1,
        borderColor: selected ? colors.ink.primary : colors.border.default,
      }}
    >
      <Text variant="body" color={selected ? colors.bg.page : colors.ink.primary} style={{ fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}
