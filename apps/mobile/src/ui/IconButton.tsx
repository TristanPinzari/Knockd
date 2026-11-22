import { Pressable } from "react-native";
import { colors } from "@/theme";
import { Icon, type IconName } from "./Icon";

interface IconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress?: () => void;
  disabled?: boolean;
  size?: number;
}

const DISABLED_OPACITY = 0.35;
const HIT_SLOP = 6;

/** A small round outlined icon button, e.g. undo / redo. */
export function IconButton({ icon, accessibilityLabel, onPress, disabled = false, size = 40 }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={HIT_SLOP}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: colors.border.default,
        backgroundColor: pressed ? colors.disabledFill : colors.bg.card,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? DISABLED_OPACITY : 1,
      })}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} color={colors.ink.primary} />
    </Pressable>
  );
}
