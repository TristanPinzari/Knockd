import { View, StyleSheet } from "react-native";
import { colors, pill, radii, shadows } from "@/theme";
import { Icon } from "../Icon";
import { Text } from "../Text";

export function OfflinePill({ top }: { top: number }) {
  return (
    <View style={[styles.pill, { top }]}>
      <View style={styles.amberDot} />
      <Text variant="body" style={{ fontSize: 13 }}>
        Offline, saving locally
      </Text>
    </View>
  );
}

/** Shown to everyone else when a teammate marks a lead ("Sam just got an A lead"). */
export function LeadAlertBanner({ top, title, subtitle }: { top: number; title: string; subtitle: string }) {
  return (
    <View accessibilityRole="alert" style={[styles.banner, { top, backgroundColor: colors.brand }]}>
      <View style={[styles.iconCircle, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
        <Icon name="bell" size={20} color={colors.ink.onBrand} />
      </View>
      <View>
        <Text variant="bodyStrong" color={colors.ink.onBrand}>
          {title}
        </Text>
        <Text variant="label" color="rgba(255,255,255,0.85)">
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

/** In-app banner shown when a teammate overtakes you on the leaderboard. */
export function PassedBanner({
  top,
  onView,
  title = "Sam passed you",
  detail = "You're now 2nd in leads. 1 lead to take it back.",
}: {
  top: number;
  onView?: () => void;
  title?: string;
  detail?: string;
}) {
  return (
    <View style={[styles.banner, { top, backgroundColor: colors.bg.card }]}>
      <View style={[styles.iconCircle, { backgroundColor: colors.crew.green }]}>
        <Icon name="arrow-up" size={20} color={colors.ink.onBrand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" color={colors.ink.secondary}>
          {detail}
        </Text>
      </View>
      <Text variant="bodyStrong" color={colors.brand} onPress={onView}>
        View
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    alignSelf: "center",
    height: 36,
    borderRadius: pill(36),
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bg.card,
    ...shadows.card,
  },
  amberDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.status.amber },
  banner: {
    position: "absolute",
    left: 16,
    right: 16,
    minHeight: 58,
    borderRadius: radii.row,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...shadows.card,
  },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
