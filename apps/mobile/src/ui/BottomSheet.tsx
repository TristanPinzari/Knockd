import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii } from "@/theme";

interface BottomSheetProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Hide the grabber handle (used by dialog-style sheets). */
  showHandle?: boolean;
  /** Reports the sheet's size, e.g. to keep floating buttons above it. */
  onLayout?: (event: LayoutChangeEvent) => void;
}

/** Full-width sheet with top radius 28. Position it absolutely at the bottom of its parent. */
export function BottomSheet({ children, style, showHandle = true, onLayout }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 6 }, style]} onLayout={onLayout}>
      {showHandle ? <View style={styles.handle} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg.card,
    borderTopLeftRadius: radii.sheetTop,
    borderTopRightRadius: radii.sheetTop,
    paddingTop: 10,
    paddingHorizontal: 24,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.default,
    marginBottom: 14,
  },
});
