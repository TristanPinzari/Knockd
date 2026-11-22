import { Pressable, View } from "react-native";
import { colors } from "@/theme";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { Tile } from "./Tile";

interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  trailing?: React.ReactNode;
}

/** Bordered white row: leading visual, two-line text, chevron. Used by Home lists and settings. */
export function ListRow({ title, subtitle, leading, onPress, chevron = true, trailing }: ListRowProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={!onPress}>
      <Tile style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        {leading}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{title}</Text>
          {subtitle ? (
            <Text variant="caption" color={colors.ink.secondary}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing}
        {chevron ? <Icon name="chevron-right" size={20} color={colors.ink.muted} /> : null}
      </Tile>
    </Pressable>
  );
}
