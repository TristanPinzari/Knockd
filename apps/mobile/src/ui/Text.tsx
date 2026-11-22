import { Text as RNText, type TextProps } from "react-native";
import { colors, typography, type TextVariant } from "@/theme";

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
}

export function Text({ variant = "body", color = colors.ink.primary, style, ...rest }: AppTextProps) {
  return <RNText {...rest} style={[typography[variant], { color }, style]} />;
}
