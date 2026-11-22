import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { crew, summary, teams } from "@/mock";
import { colors, pill, radii } from "@/theme";
import { Avatar, BottomSheet, Button, FlatHeader, Icon, ProgressBar, Screen, Text, Tile } from "@/ui";

const GRADE_FILLS = colors.gradeFills;
const MAX_HOUSES = Math.max(...summary.crew.map((entry) => entry.houses));

export default function SummaryScreen() {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<readonly string[]>(["t-lp"]);

  const toggleTeam = (id: string) =>
    setSelectedTeams((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  return (
    <Screen>
      <FlatHeader title="Session complete" subtitle={summary.when} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.totals}>
          <Total label="Houses worked" value={String(summary.housesWorked)} />
          <Total label="Leads" value={String(summary.leads)} />
          <Total label="Time" value={summary.time} />
        </View>
        <Tile radius={radii.card} style={{ padding: 16, gap: 12 }}>
          <Text variant="label" color={colors.ink.secondary}>
            Leads by grade
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {summary.grades.map((item, index) => (
              <View key={item.grade} style={[styles.gradeChip, { backgroundColor: GRADE_FILLS[index] }]}>
                <Text variant="body">
                  Grade {item.grade} {item.count}
                </Text>
              </View>
            ))}
          </View>
        </Tile>
        <Tile radius={radii.card} style={{ padding: 16, gap: 16 }}>
          <Text variant="heading">Crew</Text>
          {summary.crew.map((entry) => {
            const member = crew.find((m) => m.id === entry.id);
            if (!member) return null;
            return (
              <View key={entry.id} style={{ flexDirection: "row", gap: 12 }}>
                <Avatar initials={member.initials} colour={member.colour} size={32} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text variant="bodyStrong">{member.name}</Text>
                    <Text variant="caption" color={colors.ink.secondary}>
                      {entry.houses} houses, {entry.leads} leads
                    </Text>
                  </View>
                  <ProgressBar value={entry.houses / MAX_HOUSES} colour={member.colour} />
                </View>
              </View>
            );
          })}
          <View style={styles.rule} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant="body">Total</Text>
            <Text variant="bodyStrong">
              {summary.housesWorked} houses, {summary.leads} leads
            </Text>
          </View>
        </Tile>
      </ScrollView>
      <View style={styles.footer}>
        <Button label="Add to team" onPress={() => setSheetOpen(true)} />
      </View>

      {sheetOpen ? (
        <>
          <Pressable style={styles.scrim} onPress={() => setSheetOpen(false)} accessibilityLabel="Dismiss" />
          <BottomSheet style={{ paddingHorizontal: 20 }}>
            <Text variant="heading" style={{ textAlign: "center", marginTop: 4 }}>
              Add to London Painters?
            </Text>
            <Text variant="body" color={colors.ink.secondary} style={{ textAlign: "center", marginVertical: 10 }}>
              Everyone in this session who is on a team can upload it. It is stored once.
            </Text>
            <Text variant="caption" color={colors.ink.muted} style={{ textAlign: "center", marginBottom: 14 }}>
              Paths are saved as streets walked, not minute-by-minute locations.
            </Text>
            <View style={{ gap: 8, marginBottom: 14 }}>
              {teams.map((team) => {
                const checked = selectedTeams.includes(team.id);
                return (
                  <Pressable
                    key={team.id}
                    onPress={() => toggleTeam(team.id)}
                    style={[styles.teamRow, checked && styles.teamRowChecked]}
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked ? <Icon name="check" size={14} color={colors.ink.onBrand} /> : null}
                    </View>
                    <Text variant="bodyStrong">{team.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Button label="Add to team" onPress={() => router.replace("/(tabs)")} />
            <Button label="Not now" variant="ghost" onPress={() => router.replace("/(tabs)")} />
          </BottomSheet>
        </>
      ) : null}
    </Screen>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="caption" color={colors.ink.secondary}>
        {label}
      </Text>
      <Text variant="heading">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 110 },
  totals: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8 },
  gradeChip: { height: 36, borderRadius: pill(36), paddingHorizontal: 14, justifyContent: "center" },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border.default },
  footer: { position: "absolute", left: 16, right: 16, bottom: 34 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 52,
    paddingHorizontal: 14,
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  teamRowChecked: { borderWidth: 2, borderColor: colors.ink.primary },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.ink.primary, borderColor: colors.ink.primary },
});
