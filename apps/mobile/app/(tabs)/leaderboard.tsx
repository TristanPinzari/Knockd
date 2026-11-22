import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { HOUSES_PER_DAY, leaderboard, METRICS, PERIODS, STATS_TOTALS, crew, TEAM_NAME } from "@/mock";
import { colors, radii } from "@/theme";
import { Avatar, Chip, FlatHeader, Icon, ProgressBar, Screen, SegmentedControl, Text, Tile } from "@/ui";

type View_ = "leaderboard" | "stats";
const VIEWS = [
  { value: "leaderboard", label: "Leaderboard" },
  { value: "stats", label: "Stats" },
] as const;
const SCOPES = [
  { value: "me", label: "Me" },
  { value: "team", label: "Team" },
] as const;

export default function LeaderboardScreen() {
  const [view, setView] = useState<View_>("leaderboard");
  return (
    <Screen>
      <FlatHeader
        title={view === "leaderboard" ? "Leaderboard" : "Stats"}
        subtitle={`${TEAM_NAME}, this week`}
        showBack={false}
      >
        <View style={{ marginTop: 12 }}>
          <SegmentedControl options={VIEWS} value={view} onChange={setView} />
        </View>
      </FlatHeader>
      <ScrollView contentContainerStyle={styles.content}>{view === "leaderboard" ? <Board /> : <Stats />}</ScrollView>
    </Screen>
  );
}

function Board() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["value"]>("week");
  const [metric, setMetric] = useState<(typeof METRICS)[number]["value"]>("leads");
  return (
    <>
      <View style={styles.chips}>
        {PERIODS.map((p) => (
          <Chip key={p.value} label={p.label} selected={p.value === period} onPress={() => setPeriod(p.value)} />
        ))}
      </View>
      <View style={styles.chips}>
        {METRICS.map((m) => (
          <Chip
            key={m.value}
            label={m.label}
            selected={m.value === metric}
            onPress={() => setMetric(m.value)}
            height={32}
          />
        ))}
      </View>
      <View style={styles.position}>
        <Text variant="label" color={colors.ink.secondary}>
          Your position
        </Text>
        <Text variant="title" style={{ fontSize: 24 }}>
          You&apos;re 2nd
        </Text>
        <Text variant="label" color={colors.ink.secondary}>
          1 lead behind Sam M.
        </Text>
        <ProgressBar value={0.88} height={6} trackColour={colors.bg.card} />
      </View>
      <Tile radius={radii.card} style={{ padding: 8 }}>
        {leaderboard.map((row) => (
          <View key={row.memberId} style={[styles.row, row.isMe && { backgroundColor: colors.blueTint }]}>
            <Text variant="body" color={colors.ink.secondary} style={{ width: 24, textAlign: "center" }}>
              {row.rank}
            </Text>
            <Avatar initials={row.initials} colour={row.colour} size={32} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text variant="bodyStrong" style={{ fontSize: 15 }}>
                  {row.name}
                </Text>
                {row.isMe ? (
                  <View style={styles.you}>
                    <Text variant="caption" color={colors.ink.onBrand}>
                      You
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text variant="caption" color={colors.ink.secondary}>
                {row.detail}
              </Text>
            </View>
            <Text variant="title" style={{ fontSize: 20 }}>
              {row.leads}
            </Text>
            <Icon
              name={row.trend === "up" ? "arrow-up" : "arrow-down"}
              size={16}
              color={row.trend === "up" ? colors.routeBlue : colors.ink.muted}
            />
          </View>
        ))}
      </Tile>
      <Text variant="label" color={colors.ink.secondary}>
        Rankings update live. A lead counts the same at every grade.
      </Text>
    </>
  );
}

function Stats() {
  const [scope, setScope] = useState<(typeof SCOPES)[number]["value"]>("team");
  return (
    <>
      <View style={styles.chips}>
        {SCOPES.map((s) => (
          <Chip key={s.value} label={s.label} selected={s.value === scope} onPress={() => setScope(s.value)} />
        ))}
      </View>
      <View style={styles.tiles}>
        <StatTile label="Houses worked" value={STATS_TOTALS.houses} />
        <StatTile label="Leads A+B" value={STATS_TOTALS.leads} />
        <StatTile label="Success rate" value={STATS_TOTALS.successRate} />
      </View>
      <Tile radius={radii.card} style={{ padding: 16, gap: 16 }}>
        <Text variant="heading">Houses per day</Text>
        <View style={styles.bars}>
          {HOUSES_PER_DAY.map((bar, index) => (
            <View key={index} style={{ flex: 1, alignItems: "center", gap: 8 }}>
              <View style={{ height: 80, justifyContent: "flex-end", alignSelf: "stretch" }}>
                <View
                  style={{
                    height: 80 * bar.value,
                    borderRadius: 8,
                    backgroundColor: "highlight" in bar ? colors.crew.blue : colors.routeBlue,
                  }}
                />
              </View>
              <Text variant="caption" color={colors.ink.muted}>
                {bar.day}
              </Text>
            </View>
          ))}
        </View>
      </Tile>
      <Tile radius={radii.card} style={{ padding: 16, gap: 14 }}>
        <Text variant="heading">Success rate by crew</Text>
        {crew.map((member) => (
          <View key={member.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar initials={member.initials} colour={member.colour} size={32} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{member.name}</Text>
                <Text variant="caption" color={colors.ink.secondary}>
                  {member.houses} houses
                </Text>
              </View>
              <Text variant="bodyStrong">{(member.successRate * 100).toFixed(1)}%</Text>
            </View>
            <ProgressBar value={member.successRate / 0.11} colour={member.colour} height={6} />
          </View>
        ))}
      </Tile>
    </>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Tile radius={radii.row} style={{ flex: 1, padding: 12, gap: 2 }}>
      <Text variant="caption" color={colors.ink.secondary}>
        {label}
      </Text>
      <Text variant="title">{value}</Text>
    </Tile>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingTop: 16, gap: 12 },
  chips: { flexDirection: "row", gap: 8 },
  position: {
    backgroundColor: colors.blueTint,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.routeBlue,
    padding: 16,
    gap: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radii.row,
  },
  you: {
    backgroundColor: colors.crew.blue,
    borderRadius: 10,
    paddingHorizontal: 8,
    height: 20,
    justifyContent: "center",
  },
  tiles: { flexDirection: "row", gap: 8 },
  bars: { flexDirection: "row", gap: 12, alignItems: "flex-end" },
});
