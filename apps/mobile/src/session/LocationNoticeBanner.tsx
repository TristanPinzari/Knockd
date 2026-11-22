/**
 * The small "location is limited" notice. It sits in a screen's layout (never floating over it),
 * so it can't cover headers or other banners. Dismissing it hides that message on every screen.
 */
import { Linking, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { create } from "zustand";
import { useMyLocationStore } from "../location/myLocationStore";
import { colors, pill } from "../theme";
import { Text } from "../ui/Text";
import { locationNotice } from "./locationNotice";

interface DismissedNotices {
  readonly dismissed: string | null;
  dismiss(message: string): void;
}

const useDismissedNotice = create<DismissedNotices>()((set) => ({
  dismissed: null,
  dismiss: (message) => set({ dismissed: message }),
}));

export interface LocationNoticeBannerProps {
  readonly style?: StyleProp<ViewStyle>;
}

export function LocationNoticeBanner({ style }: LocationNoticeBannerProps) {
  const permission = useMyLocationStore((s) => s.permission);
  const error = useMyLocationStore((s) => s.error);
  const dismissed = useDismissedNotice((s) => s.dismissed);
  const dismiss = useDismissedNotice((s) => s.dismiss);
  const notice = locationNotice(permission, error);
  if (!notice || dismissed === notice.message) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={notice.openSettings ? "Opens Settings" : "Dismisses this notice"}
      onPress={() => {
        if (notice.openSettings) void Linking.openSettings();
        dismiss(notice.message);
      }}
      style={[styles.pill, style]}
    >
      <View style={styles.dot} />
      <Text variant="caption" color={colors.ink.secondary} style={styles.text}>
        {notice.message}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: pill(32),
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bg.page,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.status.amber },
  text: { flexShrink: 1 },
});
