import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { crew, teamSplitOptions, useSessionUi } from "@/mock";
import { colors, pill, radii, shadows } from "@/theme";
import { Avatar, BottomSheet, Button, FlatHeader, Icon, Screen, Text } from "@/ui";
import { TeamAreasOverlay } from "@/ui/placeholders";
import { MapSlot } from "@/ui/slots";

type SheetMode = "assign" | "split";

const AVATAR_SPOTS = [
  { id: "m-ava", x: 62, y: 200 },
  { id: "m-jas", x: 289, y: 150 },
  { id: "m-sam", x: 174, y: 325 },
  { id: "m-leo", x: 62, y: 430 },
] as const;

export default function TeamAreasScreen() {
  const router = useRouter();
  const setSessionLive = useSessionUi((state) => state.setSessionLive);
  const [sheet, setSheet] = useState<SheetMode>("assign");
  const [assignee, setAssignee] = useState("m-jas");
  const [option, setOption] = useState(1);

  const start = () => {
    setSessionLive(true);
    router.replace("/(tabs)/session");
  };

  return (
    <Screen>
      <MapSlot plain>
        <TeamAreasOverlay />
      </MapSlot>
      {AVATAR_SPOTS.map((spot) => {
        const member = crew.find((m) => m.id === spot.id);
        if (!member) return null;
        return (
          <View key={spot.id} style={[styles.spot, { left: spot.x - 16, top: spot.y - 16 }]}>
            <Avatar initials={member.initials} colour={member.colour} size={32} />
          </View>
        );
      })}
      <FlatHeader
        title="Team areas"
        subtitle="4 crew, 5 areas"
        right={
          <Button
            label="Auto-split"
            variant="smallOutline"
            onPress={() => setSheet("split")}
            style={{ alignSelf: "center" }}
          />
        }
      />
      <View style={styles.legend}>
        <LegendItem colour={colors.crew.blue} label="Done" />
        <LegendItem colour={colors.bg.card} label="To do" outlined />
        <LegendItem colour={colors.brand} label="Lead" round />
      </View>
      <View style={styles.unassigned}>
        <Text variant="caption" color={colors.ink.secondary}>
          Unassigned
        </Text>
      </View>

      {sheet === "assign" ? (
        <BottomSheet>
          <View style={styles.sheetHead}>
            <Pressable onPress={() => router.back()}>
              <Text variant="body" color={colors.ink.secondary}>
                Cancel
              </Text>
            </Pressable>
            <View style={{ alignItems: "center" }}>
              <Text variant="heading">Area 2</Text>
              <Text variant="caption" color={colors.ink.secondary}>
                ≈ 120 houses
              </Text>
            </View>
            <Pressable onPress={start}>
              <Text variant="body" color={colors.brand}>
                Save
              </Text>
            </Pressable>
          </View>
          {crew.map((member) => {
            const selected = member.id === assignee;
            return (
              <Pressable
                key={member.id}
                onPress={() => setAssignee(member.id)}
                style={[styles.assignRow, selected && { backgroundColor: colors.bg.page }]}
              >
                <Avatar initials={member.initials} colour={member.colour} size={32} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{member.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={styles.okDot} />
                    <Text variant="caption" color={colors.ink.secondary}>
                      Assigned to 1 area
                    </Text>
                  </View>
                </View>
                {selected ? <Icon name="check" size={20} color={colors.crew.blue} /> : null}
              </Pressable>
            );
          })}
        </BottomSheet>
      ) : (
        <BottomSheet style={{ paddingHorizontal: 20 }}>
          <Text variant="heading" style={{ marginBottom: 12 }}>
            Fewest crossings first
          </Text>
          <View style={{ gap: 8, marginBottom: 12 }}>
            {teamSplitOptions.map((item) => {
              const selected = item.id === option;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setOption(item.id)}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <View style={styles.swatch}>
                    {item.widths.map((width, index) => (
                      <View
                        key={index}
                        style={{ flex: width, backgroundColor: crew[index]?.colour, marginLeft: index ? 2 : 0 }}
                      />
                    ))}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{item.title}</Text>
                    <Text variant="caption" color={colors.ink.secondary}>
                      {item.detail}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Button label="Apply split" onPress={start} />
          <Button label="Keep my edits" variant="ghost" onPress={() => setSheet("assign")} />
        </BottomSheet>
      )}
    </Screen>
  );
}

function LegendItem({
  colour,
  label,
  outlined = false,
  round = false,
}: {
  colour: string;
  label: string;
  outlined?: boolean;
  round?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: round ? 8 : 10,
          height: round ? 8 : 6,
          borderRadius: round ? 4 : 2,
          backgroundColor: colour,
          borderWidth: outlined ? 1 : 0,
          borderColor: colors.ink.muted,
        }}
      />
      <Text variant="label">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  spot: { position: "absolute", borderRadius: 18, borderWidth: 2, borderColor: colors.bg.card, ...shadows.pin },
  legend: {
    position: "absolute",
    left: 16,
    top: 484,
    height: 34,
    borderRadius: pill(34),
    backgroundColor: colors.bg.card,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    ...shadows.raised,
  },
  unassigned: {
    position: "absolute",
    left: 251,
    top: 419,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 12,
    backgroundColor: colors.bg.card,
    justifyContent: "center",
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  assignRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.row,
  },
  okDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.status.ok },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  optionSelected: { borderWidth: 2, borderColor: colors.ink.primary },
  swatch: { width: 72, height: 34, flexDirection: "row", borderRadius: 6, overflow: "hidden" },
});
