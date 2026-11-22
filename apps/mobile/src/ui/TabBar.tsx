import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { Badge } from "./Badge";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export const TAB_ITEMS: readonly { route: string; label: string; icon: IconName }[] = [
  { route: "index", label: "Home", icon: "home" },
  { route: "session", label: "Session", icon: "map" },
  { route: "chat", label: "Chat", icon: "message-circle" },
  { route: "leaderboard", label: "Leaderboard", icon: "trophy" },
  { route: "settings", label: "Settings", icon: "settings" },
];

/** Structural subset of the React Navigation bottom-tab bar props that this bar uses. */
export interface BottomTabBarProps {
  state: { index: number; routes: readonly { key: string; name: string }[] };
  navigateToTab: (routeKey: string) => void;
}

interface TabBarProps extends BottomTabBarProps {
  /** Unread counts keyed by tab route name. */
  badges?: Readonly<Partial<Record<string, number>>>;
}

export function TabBar({ state, navigateToTab, badges = {} }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index]?.name;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) + 4 }]}>
      {TAB_ITEMS.map((item) => {
        const active = item.route === activeRoute;
        const colour = active ? colors.ink.primary : colors.ink.muted;
        const badge = badges[item.route] ?? 0;
        return (
          <Pressable
            key={item.route}
            accessibilityRole="tab"
            accessibilityLabel={badge > 0 ? `${item.label}, ${badge} unread` : item.label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              const target = state.routes.find((route) => route.name === item.route);
              if (target) navigateToTab(target.key);
            }}
            style={styles.item}
          >
            <View>
              <Icon name={item.icon} size={24} color={colour} />
              <Badge count={badge} style={styles.badge} />
            </View>
            <Text variant={active ? "captionStrong" : "caption"} color={colour} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    paddingTop: 12,
    paddingHorizontal: 8,
    backgroundColor: colors.bg.card,
    borderTopWidth: 1,
    borderTopColor: colors.border.soft,
  },
  item: { flex: 1, alignItems: "center", gap: 4 },
  badge: { top: -6, right: -12 },
});
