import type { ViewStyle } from "react-native";
import { colors } from "./themes";

const shadowColour = colors.shadow;

export const shadows: Record<"card" | "raised" | "pin", ViewStyle> = {
  card: {
    shadowColor: shadowColour,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 4,
  },
  raised: {
    shadowColor: shadowColour,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  pin: {
    shadowColor: shadowColour,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
  },
};
