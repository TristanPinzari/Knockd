import { Pressable, View } from "react-native";
import { colors, shadows } from "@/theme";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

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
      {badge ? (
        <View
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: colors.brand,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: colors.bg.card,
          }}
        >
          <Text variant="captionStrong" color={colors.ink.onBrand} style={{ fontSize: 11, lineHeight: 13 }}>
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
