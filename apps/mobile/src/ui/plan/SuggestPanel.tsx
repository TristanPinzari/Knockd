import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import type { SuggestOption } from "@knockd/shared";
import type { SuggestBrush } from "@/suggest/suggestStore";
import { clockLabel, durationLabel } from "@/suggest/suggestView";
import { colors, pill } from "@/theme";
import { Avatar } from "../Avatar";
import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { Text } from "../Text";

const BRUSHES: { brush: SuggestBrush; label: string; hint: string }[] = [
  { brush: "add", label: "Select", hint: "Brush over the houses to knock. Every one of them gets visited." },
  { brush: "remove", label: "Unselect", hint: "Brush over houses to leave out (a corner store, a house to skip)." },
  { brush: "car", label: "Car", hint: "Tap where the car is: every route starts there." },
  { brush: "meet", label: "Meet pin", hint: "Optional: tap where everyone should meet at the end." },
];

export interface CrewFace {
  readonly id: string;
  readonly initials: string;
  readonly colour: string;
}

export interface SuggestPanelProps {
  readonly brush: SuggestBrush;
  readonly selectedCount: number;
  readonly hasMeet: boolean;
  readonly options: readonly SuggestOption[] | null;
  readonly chosen: number;
  readonly unrouted: number;
  readonly swapping: string | null;
  readonly busy: boolean;
  readonly crew: Readonly<Record<string, CrewFace>>;
  readonly nowMs: number;
  readonly onBrush: (brush: SuggestBrush) => void;
  readonly onClear: () => void;
  readonly onSuggest: () => void;
  readonly onChoose: (index: number) => void;
  readonly onTapMember: (memberId: string) => void;
  readonly onEdit: () => void;
  readonly onApply: () => void;
  readonly onBack: () => void;
  readonly onLayout?: (e: LayoutChangeEvent) => void;
}

/** Suggest in planning mode: pick houses, then compare ranked options and use one. */
export function SuggestPanel(props: SuggestPanelProps) {
  return (
    <BottomSheet onLayout={props.onLayout} style={styles.sheet}>
      {props.options ? <Options {...props} options={props.options} /> : <Selecting {...props} />}
    </BottomSheet>
  );
}

function Selecting(props: SuggestPanelProps) {
  const hint = BRUSHES.find((b) => b.brush === props.brush)?.hint ?? "";
  const n = props.selectedCount;
  return (
    <>
      <Text variant="heading">Suggest routes</Text>
      <Text variant="label" color={colors.ink.secondary} style={styles.hint}>
        {hint}
      </Text>
      <View style={styles.segments}>
        {BRUSHES.map((b) => {
          const on = b.brush === props.brush;
          return (
            <Pressable
              key={b.brush}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => props.onBrush(b.brush)}
              style={[styles.segment, on && styles.segmentOn]}
            >
              <Text variant="captionStrong" color={on ? colors.bg.page : colors.ink.primary}>
                {b.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.countRow}>
        <Text variant="body" color={colors.ink.secondary} style={{ flex: 1 }}>
          {n === 0 ? "No houses selected" : `${n} house${n === 1 ? "" : "s"} selected`}
          {props.hasMeet ? " · meet pin set" : ""}
        </Text>
        {n > 0 || props.hasMeet ? (
          <Button label="Clear" variant="ghost" onPress={props.onClear} style={styles.inline} />
        ) : null}
      </View>
      <View style={styles.buttons}>
        <Button label="Back" variant="secondary" onPress={props.onBack} style={styles.half} />
        {props.busy ? (
          <View style={[styles.half, styles.busy]}>
            <ActivityIndicator color={colors.brand} />
            <Text variant="label" color={colors.ink.secondary}>
              Planning…
            </Text>
          </View>
        ) : (
          <Button label="Suggest" disabled={n === 0} onPress={props.onSuggest} style={styles.half} />
        )}
      </View>
    </>
  );
}

function Options(props: SuggestPanelProps & { options: readonly SuggestOption[] }) {
  const { options, chosen, crew, nowMs, swapping } = props;
  const best = options[0]!.togetherS;
  const option = options[chosen]!;
  return (
    <>
      <Text variant="heading">Pick a plan</Text>
      <Text variant="label" color={colors.ink.secondary} style={styles.hint}>
        Best first: most doors, everyone back together soonest. Tap a person, then someone in another group to swap
        them.
      </Text>
      <ScrollView style={styles.list} nestedScrollEnabled>
        {options.map((o, i) => {
          const on = i === chosen;
          const extra = o.togetherS - best;
          return (
            <Pressable
              key={`${o.mode}-${o.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => props.onChoose(i)}
              style={[styles.option, on && styles.optionOn]}
            >
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{o.label}</Text>
                <Text variant="label" color={colors.ink.secondary}>
                  Back together ~{clockLabel(nowMs, o.togetherS)} ({durationLabel(o.togetherS)})
                </Text>
              </View>
              <Text variant="captionStrong" color={i === 0 ? colors.status.ok : colors.ink.muted}>
                {i === 0 ? "Best" : `+${durationLabel(extra)}`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.groups}>
        {option.groups.map((g, gi) => (
          <View key={gi} style={styles.group}>
            {g.memberIds.map((id) => {
              const face = crew[id];
              const picked = swapping === id;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={`Swap ${face?.initials ?? "person"}`}
                  onPress={() => props.onTapMember(id)}
                  style={[styles.face, picked && styles.facePicked]}
                >
                  <Avatar initials={face?.initials ?? "?"} colour={face?.colour ?? colors.ink.muted} size={28} />
                </Pressable>
              );
            })}
            <Text variant="caption" color={colors.ink.secondary}>
              {g.doors} doors
            </Text>
          </View>
        ))}
      </View>

      {props.unrouted > 0 ? (
        <Text variant="label" color={colors.status.amber} style={styles.warn}>
          {props.unrouted} selected house{props.unrouted === 1 ? " isn't" : "s aren't"} on a known street, so{" "}
          {props.unrouted === 1 ? "it's" : "they're"} not in the routes.
        </Text>
      ) : null}

      <View style={styles.buttons}>
        <Button label="Change houses" variant="secondary" onPress={props.onEdit} style={styles.half} />
        <Button label="Use this plan" disabled={props.busy} onPress={props.onApply} style={styles.half} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 16 },
  hint: { marginTop: 2, marginBottom: 10 },
  segments: { flexDirection: "row", gap: 6 },
  segment: {
    flex: 1,
    height: 36,
    borderRadius: pill(36),
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentOn: { backgroundColor: colors.ink.primary, borderColor: colors.ink.primary },
  countRow: { flexDirection: "row", alignItems: "center", marginTop: 10, minHeight: 40 },
  inline: { alignSelf: "center", paddingHorizontal: 12 },
  buttons: { flexDirection: "row", gap: 10, marginTop: 10 },
  half: { flex: 1 },
  busy: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  list: { maxHeight: 180 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
    marginBottom: 6,
  },
  optionOn: { borderColor: colors.ink.primary, borderWidth: 2 },
  groups: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  group: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: pill(40),
    backgroundColor: colors.bg.page,
  },
  face: { borderRadius: pill(34), borderWidth: 2, borderColor: "transparent" },
  facePicked: { borderColor: colors.ink.primary },
  warn: { marginTop: 8 },
});
