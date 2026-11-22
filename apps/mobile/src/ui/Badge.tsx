import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "@/theme";
import { Text } from "./Text";

interface BadgeProps {
  count: number;
  style?: StyleProp<ViewStyle>;
}

/** Small brand-coloured count bubble, positioned by the caller. Renders nothing for zero. */
export function Badge({ count, style }: BadgeProps) {
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, style]}>
      <Text variant="captionStrong" color={colors.ink.onBrand} style={styles.label}>
        {count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.bg.card,
  },
  label: { fontSize: 11, lineHeight: 13 },
});
