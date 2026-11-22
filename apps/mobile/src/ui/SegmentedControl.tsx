import { Pressable, StyleSheet, View } from "react-native";
import { colors, pill, shadows } from "@/theme";
import { Text } from "./Text";

interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange?: (next: T) => void;
  /** `dark` = ink pill on grey track (headers); `light` = white pill (settings). */
  tone?: "dark" | "light";
  height?: number;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  tone = "dark",
  height = 40,
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.track, { height: height + 8, borderRadius: pill(height + 8) }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange?.(option.value)}
            style={[
              styles.segment,
              { height, borderRadius: pill(height) },
              selected && (tone === "dark" ? styles.selectedDark : [styles.selectedLight, shadows.raised]),
            ]}
          >
            <Text
              variant={selected ? "bodyStrong" : "body"}
              color={selected ? (tone === "dark" ? colors.ink.onBrand : colors.ink.primary) : colors.ink.secondary}
              style={{ fontSize: 13 }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", backgroundColor: colors.disabledFill, padding: 4, alignItems: "center" },
  segment: { flex: 1, alignItems: "center", justifyContent: "center" },
  selectedDark: { backgroundColor: colors.ink.primary },
  selectedLight: { backgroundColor: colors.bg.card },
});
