import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Share, StyleSheet, View } from "react-native";
import Svg, { Circle, Rect } from "react-native-svg";
import { JOIN_CODE } from "@/mock";
import { logger } from "@/realtime/logger";
import { sessionErrorMessage, useActiveSession, useLobbyCrew } from "@/session";
import { sessionLifecycle } from "@/session/defaultDeps";
import { colors, radii } from "@/theme";
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

export default function LobbyScreen() {
  const router = useRouter();
  const active = useActiveSession((state) => state.active);
  const crew = useLobbyCrew();
  const sim = useSimulatedCrew();
  const joinCode = active?.joinCode ?? JOIN_CODE;
  return (
    <Screen>
      <FlatHeader title="Lobby" />
      <ScrollView contentContainerStyle={styles.content}>
        <Tile raised radius={radii.card} style={styles.codeCard}>
          <Text variant="label" color={colors.ink.secondary}>
            Join code
          </Text>
          <Text variant="display" style={{ letterSpacing: 1 }}>
            {joinCode}
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {/* TODO(share): Copy should use expo-clipboard once installed; both open the share sheet for now. */}
            <Button label="Copy" variant="smallOutline" onPress={() => void shareCode(joinCode)} />
            <Button label="Share" variant="smallOutline" onPress={() => void shareCode(joinCode)} />
          </View>
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
                {member.online ? "Joined" : "Offline"}
              </Text>
            </View>
            {member.isHost ? (
              <Text variant="label" color={colors.ink.secondary}>
                Host
              </Text>
            ) : null}
          </Tile>
        ))}
        <View style={styles.waiting}>
          <Icon name="plus" size={20} color={colors.ink.muted} />
          <Text variant="body" color={colors.ink.muted}>
            Waiting for more crew
          </Text>
        </View>

        {active?.isAdmin ? (
          <View style={styles.sim}>
            <Button
              label={sim.starting ? "Starting..." : "Start simulated crew"}
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

        <Tile raised radius={radii.row} style={styles.areaCard}>
          <View style={styles.thumb}>
            <Svg width={72} height={72} viewBox="0 0 72 72">
              <Rect width={72} height={72} fill={colors.bg.map} />
              <Circle
                cx={36}
                cy={36}
                r={22}
                fill={colors.brandTint}
                stroke={colors.brand}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            </Svg>
          </View>
          <View style={{ gap: 2 }}>
            <Text variant="bodyStrong">Old North</Text>
            <Text variant="caption" color={colors.ink.secondary}>
              ≈ 640 houses
            </Text>
          </View>
        </Tile>
      </ScrollView>
      <View style={styles.footer}>
        {active ? (
          <Button label="Go to the map" onPress={() => router.replace("/(tabs)/session")} />
        ) : (
          <Button label="Plan areas" onPress={() => router.push("/team-areas")} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 12, paddingBottom: 100 },
  codeCard: { alignItems: "center", paddingVertical: 16, gap: 4, marginBottom: 4 },
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
  areaCard: { flexDirection: "row", alignItems: "center", gap: 16, padding: 12, marginTop: 4 },
  thumb: { width: 72, height: 72, borderRadius: 8, overflow: "hidden" },
  footer: { position: "absolute", left: 24, right: 24, bottom: 34 },
});
