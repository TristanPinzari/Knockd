import { View } from "react-native";
import { colors, shadows } from "@/theme";
import { Text } from "./Text";

interface PinProps {
  initials: string;
  colour: string;
}

/** Map pin: coloured circle with white ring and a small tail pointing down. */
export function Pin({ initials, colour }: PinProps) {
  return (
    <View style={{ alignItems: "center", width: 36 }}>
      <View
        style={[
          {
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colour,
            borderWidth: 2,
            borderColor: colors.bg.card,
          },
          { alignItems: "center", justifyContent: "center" },
          shadows.pin,
        ]}
      >
        <Text variant="captionStrong" color={colors.ink.onBrand}>
          {initials}
        </Text>
      </View>
      <View
        style={{
          width: 0,
          height: 0,
          marginTop: -2,
          borderLeftWidth: 5,
          borderRightWidth: 5,
          borderTopWidth: 8,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderTopColor: colors.bg.card,
        }}
      />
    </View>
  );
}
