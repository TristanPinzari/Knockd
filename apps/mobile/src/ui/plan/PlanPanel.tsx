import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import type { Ink, PlanTool } from "@/plan/planOps";
import { colors, pill } from "@/theme";
import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { Icon, type IconName } from "../Icon";
import { IconButton } from "../IconButton";
import { Text } from "../Text";

const TOOLS: { tool: PlanTool; icon: IconName; label: string; hint: string }[] = [
  { tool: "move", icon: "move", label: "Move", hint: "Move and zoom the map. Pick a tool to plan." },
  {
    tool: "claim",
    icon: "grid",
    label: "Claim",
    hint: "Tap blocks to claim them for the colour below. Tap again to unclaim.",
  },
  {
    tool: "route",
    icon: "navigation",
    label: "Route",
    hint: "Draw a route with your finger: a dashed line with an arrow.",
  },
  { tool: "freehand", icon: "edit-2", label: "Draw", hint: "Draw freely: circle an area or mark a boundary." },
  { tool: "note", icon: "message-square", label: "Note", hint: "Tap the map to add a note. Tap a note to edit it." },
  {
    tool: "eraser",
    icon: "delete",
    label: "Eraser",
    hint: "Drag over lines and notes to remove them. Tap a claimed block to unclaim it.",
  },
];

const SWATCH = 34;

interface InkChoice {
  readonly ink: Ink;
  readonly colour: string;
  readonly label?: string;
  readonly isMe?: boolean;
}

export interface PlanPanelProps {
  readonly tool: PlanTool;
  readonly ink: Ink;
  readonly memberInks: readonly InkChoice[];
  readonly utilityInks: readonly InkChoice[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onTool: (tool: PlanTool) => void;
  readonly onInk: (ink: Ink) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onClearMine: () => void;
  readonly onSuggest: () => void;
  readonly onDone: () => void;
  readonly onLayout?: (e: LayoutChangeEvent) => void;
}

const sameInk = (a: Ink, b: Ink) => a.memberId === b.memberId && a.colour === b.colour;

/** Planning mode toolbar (README "Planning mode"): tools, colours, undo/redo, clear mine. */
export function PlanPanel(props: PlanPanelProps) {
  const { tool, ink, memberInks, utilityInks, onTool, onInk } = props;
  const [moreColours, setMoreColours] = useState(ink.colour !== undefined);
  const hint = TOOLS.find((t) => t.tool === tool)?.hint ?? "";
  const shownInks = moreColours ? [...memberInks, ...utilityInks] : memberInks;

  const confirmClear = () =>
    Alert.alert("Clear your plan?", "Removes your own claims, lines and notes. Teammates' stay.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear mine", style: "destructive", onPress: props.onClearMine },
    ]);

  return (
    <BottomSheet onLayout={props.onLayout} style={styles.sheet}>
      <Text variant="label" color={colors.ink.secondary} style={styles.hint}>
        {hint}
      </Text>

      <View style={styles.tools}>
        {TOOLS.map((t) => {
          const on = t.tool === tool;
          return (
            <Pressable
              key={t.tool}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
              onPress={() => onTool(t.tool)}
              style={[styles.tool, on && styles.toolOn]}
            >
              <Icon name={t.icon} size={20} color={on ? colors.bg.page : colors.ink.primary} />
              <Text variant="caption" color={on ? colors.bg.page : colors.ink.secondary}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tool !== "move" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colours}>
          {shownInks.map((choice) => {
            const on = sameInk(choice.ink, ink);
            return (
              <Pressable
                key={choice.ink.memberId ?? choice.ink.colour}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={choice.label ?? `Colour ${choice.colour}`}
                onPress={() => onInk(choice.ink)}
                style={styles.swatchWrap}
              >
                <View style={[styles.ring, on && { borderColor: colors.ink.primary }]}>
                  <View style={[styles.swatch, { backgroundColor: choice.colour }]} />
                </View>
                {choice.label ? (
                  <Text variant="caption" color={colors.ink.secondary} numberOfLines={1} style={styles.swatchLabel}>
                    {choice.label}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
          {utilityInks.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={moreColours ? "Fewer colours" : "More colours"}
              onPress={() => setMoreColours((v) => !v)}
              style={styles.more}
            >
              <Text variant="captionStrong" color={colors.ink.secondary}>
                {moreColours ? "Less" : "More colours"}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : null}

      <View style={styles.actions}>
        <IconButton icon="corner-up-left" accessibilityLabel="Undo" disabled={!props.canUndo} onPress={props.onUndo} />
        <IconButton icon="corner-up-right" accessibilityLabel="Redo" disabled={!props.canRedo} onPress={props.onRedo} />
        <IconButton icon="trash-2" accessibilityLabel="Clear mine" onPress={confirmClear} />
        <View style={{ flex: 1 }} />
        <Button label="Suggest" variant="smallOutline" onPress={props.onSuggest} style={styles.done} />
        <Button label="Done" variant="small" onPress={props.onDone} style={styles.done} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 16 },
  hint: { marginBottom: 10, minHeight: 32 },
  tools: { flexDirection: "row", gap: 6 },
  tool: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  toolOn: { backgroundColor: colors.ink.primary, borderColor: colors.ink.primary },
  colours: { gap: 10, paddingVertical: 12, alignItems: "flex-start" },
  swatchWrap: { alignItems: "center", width: 48 },
  ring: { padding: 2, borderRadius: pill(SWATCH + 8), borderWidth: 2, borderColor: "transparent" },
  swatch: { width: SWATCH, height: SWATCH, borderRadius: pill(SWATCH) },
  swatchLabel: { marginTop: 2, maxWidth: 48 },
  more: {
    height: SWATCH + 8,
    paddingHorizontal: 12,
    borderRadius: pill(SWATCH + 8),
    borderWidth: 1,
    borderColor: colors.border.default,
    justifyContent: "center",
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  done: { alignSelf: "center" },
});
