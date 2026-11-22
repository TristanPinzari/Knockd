import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { liveSession, suggestedAreas, teams, useSessionUi } from "@/mock";
import { colors, radii } from "@/theme";
import { Avatar, Button, Icon, ListRow, ProgressBar, Screen, Text, Tile } from "@/ui";

export default function HomeScreen() {
  const router = useRouter();
  const live = useSessionUi((state) => state.sessionLive);

  return (
    <Screen padTop>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hello}>
          <Text variant="title" style={{ flex: 1 }}>
            Hi Jas
          </Text>
          <Avatar initials="JK" />
        </View>

        {live ? <LiveCard onResume={() => router.navigate("/(tabs)/session")} /> : null}
        <StartCard live={live} onChoose={() => router.push("/choose-area")} />

        <ListRow
          title="Join with a code"
          leading={<Icon name="align-left" size={20} color={colors.ink.secondary} />}
          onPress={() => router.push("/join")}
        />

        <Section title="Your teams">
          {teams.slice(0, 1).map((team) => (
            <ListRow
              key={team.id}
              title={team.name}
              subtitle={`${team.members} members`}
              leading={<Avatar initials="LP" colour={colors.crew.purple} />}
            />
          ))}
        </Section>

        <Section title="Suggested areas">
          {suggestedAreas.map((area) => (
            <ListRow
              key={area.id}
              title={area.name}
              subtitle={`≈ ${area.houses} houses`}
              onPress={() => router.push("/choose-area")}
              leading={
                <View style={styles.areaIcon}>
                  <Icon name="map-pin" size={18} color={colors.ink.secondary} />
                </View>
              }
            />
          ))}
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}

function LiveCard({ onResume }: { onResume: () => void }) {
  return (
    <Tile raised radius={radii.card} style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={styles.liveDot} />
        <Text variant="label">Live now</Text>
      </View>
      <Text variant="heading">
        {liveSession.crew} crew, {liveSession.housesDone} of {liveSession.housesTotal} houses
      </Text>
      <ProgressBar value={liveSession.housesDone / liveSession.housesTotal} />
      <Button label="Resume" onPress={onResume} />
    </Tile>
  );
}

function StartCard({ live, onChoose }: { live: boolean; onChoose: () => void }) {
  if (live) {
    return (
      <Tile raised radius={radii.card} style={styles.startRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">Start a session</Text>
          <Text variant="caption" color={colors.ink.secondary}>
            Pick an area for a new crew
          </Text>
        </View>
        <Button label="Choose area" variant="small" onPress={onChoose} />
      </Tile>
    );
  }
  return (
    <Tile raised radius={radii.card} style={{ padding: 20, gap: 8 }}>
      <Text variant="title">Start a session</Text>
      <Text variant="body" color={colors.ink.secondary}>
        Pick an area on the map, then invite your crew with a code.
      </Text>
      <View style={{ height: 4 }} />
      <Button label="Choose area" onPress={onChoose} />
    </Tile>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 16 },
  hello: { flexDirection: "row", alignItems: "center" },
  areaIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg.page,
    alignItems: "center",
    justifyContent: "center",
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.status.ok },
  startRow: { padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
});
