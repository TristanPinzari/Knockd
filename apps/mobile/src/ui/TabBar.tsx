import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export const TAB_ITEMS: readonly { route: string; label: string; icon: IconName }[] = [
  { route: "index", label: "Home", icon: "home" },
  { route: "session", label: "Session", icon: "map" },
  { route: "leaderboard", label: "Leaderboard", icon: "trophy" },
];

/** Structural subset of the React Navigation bottom-tab bar props that this bar uses. */
export interface BottomTabBarProps {
  state: { index: number; routes: readonly { key: string; name: string }[] };
  navigateToTab: (routeKey: string) => void;
}

export function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index]?.name;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) + 4 }]}>
      {TAB_ITEMS.map((item) => {
        const active = item.route === activeRoute;
        const colour = active ? colors.ink.primary : colors.ink.muted;
        return (
          <Pressable
            key={item.route}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              const target = state.routes.find((route) => route.name === item.route);
              if (target) navigateToTab(target.key);
            }}
            style={styles.item}
          >
            <Icon name={item.icon} size={24} color={colour} />
            <Text variant={active ? "captionStrong" : "caption"} color={colour}>
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
    justifyContent: "space-between",
    paddingTop: 12,
    paddingHorizontal: 40,
    backgroundColor: colors.bg.card,
    borderTopWidth: 1,
    borderTopColor: colors.border.soft,
  },
  item: { alignItems: "center", gap: 4, minWidth: 64 },
});
