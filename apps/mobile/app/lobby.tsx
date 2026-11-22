import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, View } from "react-native";
import { logger } from "@/realtime/logger";
import { sessionErrorMessage, useActiveSession, useLobbyCrew } from "@/session";
import { sessionLifecycle } from "@/session/defaultDeps";
import { colors, radii } from "@/theme";
import { LocationNoticeBanner } from "@/session/LocationNoticeBanner";
import { Avatar, Button, FlatHeader, Icon, Screen, Text, Tile } from "@/ui";

const MAX_CREW = 8;
const SIM_BOTS = 3;

async function shareCode(code: string): Promise<void> {
  try {
    await Share.share({ message: `Join my Knockd session with code ${code}` });
  } catch (error) {
    logger.warn("lobby: share failed", error);
  }
}

function useSimulatedCrew() {
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const start = async () => {
    setStarting(true);
    setMessage(null);
    try {
      const count = await sessionLifecycle.startSim(SIM_BOTS);
      setMessage(`${count} simulated crew joined. They'll start walking in a moment.`);
    } catch (cause) {
      setMessage(sessionErrorMessage("startSim", cause));
    } finally {
      setStarting(false);
    }
  };
  return { starting, message, start };
}

/** Admin: remove someone, after a confirm. Errors show in the lobby's message line. */
function confirmRemove(name: string, memberId: string, onError: (message: string) => void): void {
  Alert.alert(`Remove ${name}?`, "They leave the session. They can join again with the code.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Remove",
      style: "destructive",
      onPress: () =>
        void sessionLifecycle.removeMember(memberId).catch((cause: unknown) => {
          logger.warn("lobby: remove failed", cause);
          onError(`Couldn't remove ${name}. Check your signal and try again.`);
        }),
    },
  ]);
}

/**
 * Lobby (MOBILE.md screen 5): the join code to share, and who's in, each in their colour (live from
 * `member:joined`). The session admin can add the simulated crew and remove people.
 */
export default function LobbyScreen() {
  const router = useRouter();
  const active = useActiveSession((state) => state.active);
  const crew = useLobbyCrew();
  const sim = useSimulatedCrew();
  const [removeError, setRemoveError] = useState<string | null>(null);
  if (!active) return <Redirect href="/" />;

  return (
    <Screen>
      <FlatHeader title="Lobby" />
      <ScrollView contentContainerStyle={styles.content}>
        <LocationNoticeBanner style={{ backgroundColor: colors.bg.card }} />
        <Tile raised radius={radii.card} style={styles.codeCard}>
          <Text variant="label" color={colors.ink.secondary}>
            Join code
          </Text>
          <Text variant="display" style={{ letterSpacing: 2 }} selectable>
            {active.joinCode}
          </Text>
          <Button label="Share code" variant="smallOutline" onPress={() => void shareCode(active.joinCode)} />
        </Tile>

        <Text variant="heading">
          Crew ({crew.length} of {MAX_CREW})
        </Text>
        {crew.map((member) => (
          <Tile key={member.id} style={styles.memberRow}>
            <Avatar initials={member.initials} colour={member.colour} size={32} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">
                {member.name}
                {member.isMe ? " (you)" : ""}
              </Text>
              <Text variant="caption" color={colors.ink.secondary}>
                {member.isBot ? "Simulated" : member.online ? "Joined" : "Offline"}
              </Text>
            </View>
            {member.isHost ? (
              <Text variant="label" color={colors.ink.secondary}>
                Host
              </Text>
            ) : active.isAdmin && !member.isMe ? (
              <Button
                label="Remove"
                variant="ghost"
                onPress={() => confirmRemove(member.name, member.id, setRemoveError)}
                style={styles.remove}
              />
            ) : null}
          </Tile>
        ))}
        {removeError ? (
          <Text variant="label" color={colors.brand} accessibilityRole="alert">
            {removeError}
          </Text>
        ) : null}
        {crew.length < MAX_CREW ? (
          <View style={styles.waiting}>
            <Icon name="plus" size={20} color={colors.ink.muted} />
            <Text variant="body" color={colors.ink.muted}>
              Waiting for more crew
            </Text>
          </View>
        ) : null}

        {active.isAdmin ? (
          <View style={styles.sim}>
            <Button
              label={sim.starting ? "Adding..." : "Add simulated crew"}
              variant="secondary"
              disabled={sim.starting}
              onPress={() => void sim.start()}
            />
            {sim.message ? (
              <Text variant="label" color={colors.ink.secondary} accessibilityRole="alert">
                {sim.message}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label="Go to the map"
          // Opened from the live map's menu: go back to it rather than stacking a second map.
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/live"))}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  remove: { alignSelf: "center", paddingHorizontal: 8 },
  content: { padding: 24, gap: 12, paddingBottom: 120 },
  codeCard: { alignItems: "center", paddingVertical: 16, gap: 8, marginBottom: 4 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  waiting: {
    height: 52,
    borderRadius: radii.row,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border.default,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sim: { gap: 8, marginTop: 4 },
  footer: { position: "absolute", left: 24, right: 24, bottom: 34 },
});
