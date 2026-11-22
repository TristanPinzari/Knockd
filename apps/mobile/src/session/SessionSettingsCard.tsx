/** Settings rows for the active session: "End session" for the host, "Leave session" for everyone else. */
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { colors } from "../theme";
import { Card, SectionLabel } from "../ui/SettingsParts";
import { Icon } from "../ui/Icon";
import { Text } from "../ui/Text";
import { useActiveSession, type ActiveSession } from "./activeSessionStore";
import { sessionLifecycle } from "./defaultDeps";
import { sessionErrorMessage } from "./errorMessages";

interface RowCopy {
  title: string;
  detail: string;
  confirmTitle: string;
  confirmBody: string;
}

function copyFor(active: ActiveSession): RowCopy {
  return active.isAdmin
    ? {
        title: "End session",
        detail: `Ends session ${active.joinCode} for the whole crew`,
        confirmTitle: "End the session?",
        confirmBody: "Everyone stops tracking and sees the summary. This can't be undone.",
      }
    : {
        title: "Leave session",
        detail: `Stop sharing your location with session ${active.joinCode}`,
        confirmTitle: "Leave the session?",
        confirmBody: "You can join again with the code while it's still live.",
      };
}

export function SessionSettingsCard() {
  const active = useActiveSession((s) => s.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!active) return null;
  const copy = copyFor(active);
  const action = active.isAdmin ? "end" : "leave";

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await (active.isAdmin ? sessionLifecycle.end() : sessionLifecycle.leave());
      router.replace(active.isAdmin ? "/end" : "/");
    } catch (cause) {
      setError(sessionErrorMessage(action, cause));
    } finally {
      setBusy(false);
    }
  };

  const confirm = () =>
    Alert.alert(copy.confirmTitle, copy.confirmBody, [
      { text: "Cancel", style: "cancel" },
      { text: copy.title, style: "destructive", onPress: () => void run() },
    ]);

  return (
    <>
      <SectionLabel>Session</SectionLabel>
      <Card>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/lobby")}
          style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" style={{ fontSize: 15 }}>
              Crew and join code
            </Text>
            <Text variant="caption" color={colors.ink.secondary}>
              {active.isAdmin ? "Share the code, add simulated crew, remove people" : "Share the code with the crew"}
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color={colors.ink.muted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={confirm}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" style={{ fontSize: 15 }}>
              {busy ? `${copy.title}...` : copy.title}
            </Text>
            <Text variant="caption" color={colors.ink.secondary}>
              {copy.detail}
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color={colors.ink.muted} />
        </Pressable>
        {error ? (
          <Text variant="label" color={colors.brand} accessibilityRole="alert" style={{ marginTop: 12 }}>
            {error}
          </Text>
        ) : null}
      </Card>
    </>
  );
}
