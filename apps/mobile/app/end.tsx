import { useRouter } from "expo-router";
import { AddToTeam } from "@/account/AddToTeam";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import type { Stats } from "@knockd/shared";
import { activeLabel, distanceLabel, leadsLabel, personRows, totalLeads, type PersonStats } from "@/session/endOfDay";
import { useFinishedSession } from "@/session/finishedSessionStore";
import { useEndOfDay } from "@/session/useEndOfDay";
import { colors, radii } from "@/theme";
import { Avatar, Button, Icon, Screen, Text, Tile } from "@/ui";
import { initialsOf } from "@/ui/format";

/**
 * End of day (MOBILE.md screen 10): plain stats for the crew and each person, once the server has
 * processed the session, and "Add to your team's map" for people who were logged in.
 */
export default function EndOfDayScreen() {
  const router = useRouter();
  const finished = useFinishedSession((s) => s.finished);
  const { state, retry } = useEndOfDay(finished);

  const done = () => {
    useFinishedSession.getState().clear();
    router.replace("/");
  };

  return (
    <Screen padTop style={styles.screen}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Icon name="check-circle" size={36} color={colors.status.ok} />
          <Text variant="title">Session over</Text>
          {finished ? (
            <Text variant="body" color={colors.ink.secondary}>
              Session {finished.joinCode}
            </Text>
          ) : null}
        </View>

        {/* Right away, not after the stats: the server takes the upload as soon as the session has ended. */}
        {finished ? <AddToTeam session={finished} /> : null}

        {!finished ? (
          <Text variant="body" color={colors.ink.secondary} style={styles.centre}>
            Nice work. There are no stats to show for this session on this phone.
          </Text>
        ) : state.phase === "waiting" ? (
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.brand} />
            <Text variant="body" color={colors.ink.secondary} style={styles.centre}>
              Wrapping up: matching everyone&apos;s paths to the streets. This takes a few seconds.
            </Text>
          </View>
        ) : state.phase === "error" ? (
          <View style={styles.waiting}>
            <Text variant="body" color={colors.ink.secondary} style={styles.centre}>
              {state.message}
            </Text>
            <Button label="Try again" variant="secondary" onPress={retry} />
          </View>
        ) : (
          <>
            <Text variant="heading" style={styles.section}>
              The crew
            </Text>
            <CrewTiles stats={state.stats.crew} />
            {!state.stats.final ? (
              <Text variant="label" color={colors.ink.muted} style={styles.note}>
                Still being processed: distances are estimates for now.
              </Text>
            ) : null}

            <Text variant="heading" style={styles.section}>
              Everyone
            </Text>
            {personRows(state.stats, state.members, finished.memberId).map((p) => (
              <PersonRow key={p.memberId} person={p} />
            ))}
          </>
        )}
      </ScrollView>
      <Button label="Back to start" onPress={done} />
    </Screen>
  );
}

function CrewTiles({ stats }: { stats: Stats }) {
  const tiles: [string, string, string?][] = [
    ["Houses covered", String(stats.housesCovered)],
    ["Leads", String(totalLeads(stats)), leadsLabel(stats)],
    ["Streets worked", String(stats.streetsWorked), `${stats.streetsPassed} passed by`],
    ["Blocks completed", String(stats.blocksCompleted)],
    ["Distance", distanceLabel(stats.distanceM)],
    ["Active time", activeLabel(stats.activeS)],
  ];
  return (
    <View style={styles.grid}>
      {tiles.map(([label, value, detail]) => (
        <Tile key={label} style={styles.tile}>
          <Text variant="label" color={colors.ink.secondary}>
            {label}
          </Text>
          <Text variant="title">{value}</Text>
          {detail ? (
            <Text variant="caption" color={colors.ink.muted}>
              {detail}
            </Text>
          ) : null}
        </Tile>
      ))}
    </View>
  );
}

function PersonRow({ person }: { person: PersonStats }) {
  const s = person.stats;
  return (
    <Tile style={[styles.person, person.isMe && styles.me]}>
      <Avatar initials={initialsOf(person.name)} colour={person.colour} size={34} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {person.name}
          {person.isMe ? " (you)" : ""}
        </Text>
        <Text variant="label" color={colors.ink.secondary}>
          {s.housesCovered} houses · {s.streetsWorked} streets · {distanceLabel(s.distanceM)}
        </Text>
      </View>
      <Text variant="bodyStrong" color={totalLeads(s) > 0 ? colors.ink.primary : colors.ink.muted}>
        {leadsLabel(s)}
      </Text>
    </Tile>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 20, paddingBottom: 32 },
  fill: { flex: 1 },
  scroll: { paddingBottom: 20 },
  header: { alignItems: "center", gap: 6, marginTop: 12, marginBottom: 20 },
  centre: { textAlign: "center" },
  waiting: { alignItems: "center", gap: 14, paddingVertical: 40 },
  section: { marginTop: 8, marginBottom: 10 },
  note: { marginTop: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48%", flexGrow: 1, padding: 14, gap: 2, borderRadius: radii.tile },
  person: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginBottom: 8 },
  me: { borderColor: colors.ink.primary, borderWidth: 1.5 },
});
