import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from "react-native";
import { colors } from "../theme";
import { Avatar } from "../ui/Avatar";
import { initialsOf } from "../ui/format";
import { Text } from "../ui/Text";
import { logger } from "../realtime/logger";
import { useAccountStore } from "./accountStore";
import { loginErrorMessage } from "./loginError";

/**
 * Top-right of Welcome: "Log in", or your name (tap to log out). Logging in is optional: it's only
 * needed to add sessions to a team and to load a team map.
 */
export function AccountBar() {
  const { available, restoring, loggedIn, me, actions } = useAccountStore();
  const [busy, setBusy] = useState(false);
  if (!available || !actions) return null;

  const run = async (what: () => Promise<void>) => {
    setBusy(true);
    try {
      await what();
    } catch (error) {
      logger.warn("account: login or logout failed", error);
      // Closing the login page is a normal "cancel": nothing to show. Anything else is shown.
      const message = loginErrorMessage(error);
      if (message) useAccountStore.getState().set({ error: message });
    } finally {
      setBusy(false);
    }
  };

  if (restoring || busy) return <ActivityIndicator color={colors.ink.muted} />;

  if (!loggedIn)
    return (
      <Pressable accessibilityRole="button" onPress={() => void run(actions.login)} hitSlop={10}>
        <Text variant="bodyStrong" color={colors.brand}>
          Log in
        </Text>
      </Pressable>
    );

  const name = me?.user.displayName ?? "You";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Logged in as ${name}. Log out`}
      onPress={() =>
        Alert.alert(`Logged in as ${name}`, "Log out of Knockd on this phone?", [
          { text: "Cancel", style: "cancel" },
          { text: "Log out", style: "destructive", onPress: () => void run(actions.logout) },
        ])
      }
      style={styles.row}
    >
      <Text variant="label" color={colors.ink.secondary} numberOfLines={1} style={styles.name}>
        {name}
      </Text>
      <Avatar initials={initialsOf(name)} colour={colors.ink.primary} size={28} />
    </Pressable>
  );
}

/** "Your teams: High Five Painting, …" under the welcome text, when logged in. */
export function TeamsLine() {
  const me = useAccountStore((s) => s.me);
  const error = useAccountStore((s) => s.error);
  if (error)
    return (
      <Text variant="label" color={colors.ink.muted}>
        {error}
      </Text>
    );
  if (!me) return null;
  return (
    <View>
      <Text variant="label" color={colors.ink.muted}>
        {me.teams.length === 0
          ? "You're not on a team yet. Make one on knockd.rodeo."
          : `Your teams: ${me.teams.map((t) => t.name).join(", ")}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: 200 },
  name: { flexShrink: 1 },
});
