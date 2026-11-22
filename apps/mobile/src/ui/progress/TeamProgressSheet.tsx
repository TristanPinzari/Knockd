import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { Grade } from "@knockd/shared";
import { useAreaStore } from "@/area";
import { useLeaderboard } from "@/realtime/leaderboard";
import { housesByMember } from "@/session/teamProgress";
import { colors, pill, radii } from "@/theme";
import { Avatar } from "../Avatar";
import { BottomSheet } from "../BottomSheet";
import { Icon } from "../Icon";
import { Text } from "../Text";

const GRADES: Grade[] = ["A", "B", "C"];

/**
 * Team progress (MOBILE.md screen 9): leads per person by grade, and the crew's coverage so far.
 * Leads are live (socket); coverage comes from GET /stats every 30 s, so it lags a little.
 */
export function TeamProgressSheet({ onClose }: { onClose: () => void }) {
  const rows = useLeaderboard();
  const stats = useAreaStore((s) => s.stats);
  const houses = housesByMember(stats);
  const crew = stats?.crew;

  return (
    <>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <BottomSheet style={styles.sheet}>
        <View style={styles.head}>
          <Text variant="title" style={{ fontSize: 20, flex: 1 }}>
            Team progress
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
            <Icon name="x" size={22} color={colors.ink.secondary} />
          </Pressable>
        </View>

        {crew ? (
          <View style={styles.tiles}>
            {(
              [
                ["Houses", crew.housesCovered],
                ["Streets worked", crew.streetsWorked],
                ["Blocks done", crew.blocksCompleted],
              ] as const
            ).map(([label, value]) => (
              <View key={label} style={styles.tile}>
                <Text variant="title">{value}</Text>
                <Text variant="caption" color={colors.ink.secondary}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text variant="label" color={colors.ink.muted} style={styles.wait}>
            Coverage shows once the first numbers come in.
          </Text>
        )}

        <Text variant="heading" style={styles.section}>
          Leads
        </Text>
        <ScrollView style={styles.list}>
          {rows.map((r) => (
            <View key={r.memberId} style={[styles.row, r.isMe && styles.me]}>
              <Text variant="bodyStrong" color={colors.ink.secondary} style={styles.rank}>
                {r.rank}
              </Text>
              <Avatar initials={r.initials} colour={r.colour} size={30} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {r.name}
                  {r.isMe ? " (you)" : ""}
                </Text>
                {houses[r.memberId] !== undefined ? (
                  <Text variant="caption" color={colors.ink.secondary}>
                    {houses[r.memberId]} houses
                  </Text>
                ) : null}
              </View>
              {GRADES.map((g) => (
                <View key={g} style={[styles.grade, r.counts[g] === 0 && styles.gradeNone]}>
                  <Text variant="captionStrong" color={r.counts[g] ? colors.ink.primary : colors.ink.muted}>
                    {r.counts[g]} {g}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  sheet: { paddingHorizontal: 16, maxHeight: "80%" },
  head: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, padding: 12, borderRadius: radii.tile, backgroundColor: colors.bg.page, gap: 2 },
  wait: { marginBottom: 4 },
  section: { marginTop: 16, marginBottom: 8 },
  list: { flexGrow: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radii.row,
  },
  me: { backgroundColor: colors.brandTint },
  rank: { width: 18, textAlign: "center" },
  grade: {
    minWidth: 38,
    height: 26,
    borderRadius: pill(26),
    backgroundColor: colors.bg.page,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  gradeNone: { opacity: 0.6 },
});
