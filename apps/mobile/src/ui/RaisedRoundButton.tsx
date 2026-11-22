import { Pressable } from "react-native";
import { colors, shadows } from "@/theme";
import { Icon, type IconName } from "./Icon";
import { Badge } from "./Badge";

interface RaisedRoundButtonProps {
  icon: IconName;
  onPress?: () => void;
  size?: number;
  badge?: number;
  accessibilityLabel: string;
  iconColor?: string;
}

export function RaisedRoundButton({
  icon,
  onPress,
  size = 44,
  badge,
  accessibilityLabel,
  iconColor = colors.ink.primary,
}: RaisedRoundButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.bg.card,
          alignItems: "center",
          justifyContent: "center",
        },
        shadows.raised,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} color={iconColor} />
      {badge ? <Badge count={badge} style={{ top: -4, right: -4 }} /> : null}
    </Pressable>
  );
}
