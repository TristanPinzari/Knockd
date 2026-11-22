import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";

interface ScreenProps {
  children: React.ReactNode;
  /** Pad for the status bar. Screens with a FlatHeader handle this themselves. */
  padTop?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Screen({ children, padTop = false, style }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.root, padTop && { paddingTop: insets.top }, style]}>{children}</View>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg.page } });
