import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radii, shadows } from "@/theme";

interface TileProps {
  children: React.ReactNode;
  raised?: boolean;
  radius?: number;
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** White card surface. `raised` adds the card shadow; otherwise a soft 1px border. */
export function Tile({ children, raised = false, radius = radii.row, bordered = !raised, style }: TileProps) {
  return (
    <View
      style={[
        styles.base,
        { borderRadius: radius },
        raised && shadows.card,
        bordered && { borderWidth: 1, borderColor: colors.border.soft },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ base: { backgroundColor: colors.bg.card } });
