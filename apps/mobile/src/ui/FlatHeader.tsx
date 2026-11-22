import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { Icon } from "./Icon";
import { Text } from "./Text";

interface FlatHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  right?: React.ReactNode;
  children?: React.ReactNode;
  titleVariant?: "title" | "heading";
}

/** Flat, full-width white bar: square corners, 1px bottom hairline, no shadow. */
export function FlatHeader({
  title,
  subtitle,
  onBack,
  showBack = true,
  right,
  children,
  titleVariant = "title",
}: FlatHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const handleBack = onBack ?? (() => router.back());
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={handleBack}
            hitSlop={12}
            style={styles.back}
          >
            <Icon name="chevron-left" size={26} color={colors.ink.primary} />
          </Pressable>
        ) : null}
        <View style={styles.titles}>
          <Text variant={titleVariant}>{title}</Text>
          {subtitle ? (
            <Text variant="caption" color={colors.ink.secondary}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.bg.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  row: { flexDirection: "row", alignItems: "center", minHeight: 40 },
  back: { marginRight: 8, marginLeft: -4 },
  titles: { flex: 1 },
});
