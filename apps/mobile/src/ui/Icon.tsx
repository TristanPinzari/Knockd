import { Feather, Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { colors } from "@/theme";

type FeatherName = ComponentProps<typeof Feather>["name"];

export type IconName = FeatherName | "trophy" | "lifebuoy" | "navigation";

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 20, color = colors.ink.secondary }: IconProps) {
  if (name === "trophy") return <Ionicons name="trophy-outline" size={size} color={color} />;
  if (name === "lifebuoy") return <Ionicons name="medical-outline" size={size} color={color} />;
  if (name === "navigation") return <Ionicons name="navigate-outline" size={size} color={color} />;
  return <Feather name={name} size={size} color={color} />;
}
