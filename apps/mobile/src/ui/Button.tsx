import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors, pill, sizes } from "@/theme";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "small" | "smallOutline" | "ghost";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const HEIGHTS: Record<ButtonVariant, number> = {
  primary: sizes.buttonHeight,
  secondary: sizes.buttonHeight,
  small: 40,
  smallOutline: 32,
  ghost: 40,
};

export function Button({ label, onPress, variant = "primary", disabled = false, style }: ButtonProps) {
  const height = HEIGHTS[variant];
  const filled = variant === "primary" || variant === "small";
  const labelColour = disabled
    ? colors.ink.muted
    : filled
      ? colors.ink.onBrand
      : variant === "smallOutline"
        ? colors.brand
        : variant === "ghost"
          ? colors.ink.secondary
          : colors.ink.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { height, borderRadius: pill(height), opacity: pressed ? 0.85 : 1 },
        filled && { backgroundColor: colors.brand },
        variant === "secondary" && {
          backgroundColor: colors.bg.card,
          borderWidth: 1,
          borderColor: colors.border.default,
        },
        variant === "smallOutline" && { borderWidth: 1, borderColor: colors.brand, paddingHorizontal: 20 },
        variant === "small" && { paddingHorizontal: 24, alignSelf: "flex-start" },
        disabled && { backgroundColor: colors.disabledFill, borderColor: colors.disabledFill },
        style,
      ]}
    >
      <Text variant="bodyStrong" color={labelColour}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", alignSelf: "stretch" },
});
