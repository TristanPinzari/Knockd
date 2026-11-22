import { View } from "react-native";
import { CREW_COLOURS, colors } from "@/theme";
import { Text } from "./Text";

interface AvatarProps {
  initials: string;
  colour?: string;
  size?: number;
}

export const crewColourAt = (index: number): string => CREW_COLOURS[index % CREW_COLOURS.length] ?? colors.crew.blue;

export function Avatar({ initials, colour = colors.crew.blue, size = 28 }: AvatarProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colour,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text variant="captionStrong" color={colors.ink.onBrand} style={{ fontSize: size >= 36 ? 13 : 11 }}>
        {initials}
      </Text>
    </View>
  );
}
