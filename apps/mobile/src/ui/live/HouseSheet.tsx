import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { LEAD_NOTE_MAX, type Grade, type Lead } from "@knockd/shared";
import { colors, FONT_REGULAR, pill, radii } from "@/theme";
import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Text } from "../Text";
import { agoLabel } from "../format";
import { GRADE_OPTIONS } from "./grades";

/** How long Undo stays on screen after marking a lead. */
export const UNDO_WINDOW_MS = 5000;

export interface HouseSheetProps {
  /** This session's lead on the house, if any. */
  readonly lead: Lead | null;
  /** Who marked it, when it's a teammate's lead. */
  readonly markedBy: string | null;
  /** A lead on this house from an earlier session (a loaded team map), if any. */
  readonly previous?: { readonly grade: Grade; readonly at: string } | null;
  readonly onGrade: (grade: Grade) => void;
  readonly onUndo: () => void;
  readonly onSaveNote: (note: string) => void;
  readonly onClose: () => void;
}

/**
 * House sheet (MOBILE.md screen 8, long-press a house): grade a lead A/B/C, undo it for a few
 * seconds, and add a short note. Everything else is assumed no lead.
 */
export function HouseSheet({ lead, markedBy, previous, onGrade, onUndo, onSaveNote, onClose }: HouseSheetProps) {
  const [now] = useState(Date.now);
  const [note, setNote] = useState(lead?.note ?? "");
  const [undoVisible, setUndoVisible] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const grade = (g: Grade) => {
    onGrade(g);
    setUndoVisible(true);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoVisible(false), UNDO_WINDOW_MS);
  };

  return (
    <>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <BottomSheet style={{ paddingHorizontal: 16 }}>
        <View style={styles.head}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title" style={{ fontSize: 20 }}>
              {lead ? `${lead.grade} lead` : "Mark a lead"}
            </Text>
            <Text variant="label" color={colors.ink.secondary}>
              {markedBy ? `Marked by ${markedBy}` : lead ? "Marked by you" : "No lead yet: pick a grade"}
            </Text>
            {previous ? (
              <Text variant="label" color={colors.ink.muted}>
                Previous lead: {previous.grade} · {agoLabel(previous.at, now)}
              </Text>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
            <Icon name="x" size={20} color={colors.ink.primary} />
          </Pressable>
        </View>

        <View style={styles.grades}>
          {GRADE_OPTIONS.map((option) => {
            const selected = lead?.grade === option.grade;
            return (
              <Pressable
                key={option.grade}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${option.grade} lead: ${option.text}`}
                onPress={() => grade(option.grade)}
                style={[styles.grade, selected && styles.gradeSelected]}
              >
                <Text variant="title" color={selected ? colors.ink.onBrand : colors.ink.primary}>
                  {option.grade}
                </Text>
                <Text
                  variant="caption"
                  color={selected ? colors.ink.onBrand : colors.ink.secondary}
                  style={{ textAlign: "center" }}
                >
                  {option.text}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {undoVisible && lead ? (
          <Button
            label="Undo"
            variant="smallOutline"
            onPress={() => {
              onUndo();
              setUndoVisible(false);
            }}
            style={{ alignSelf: "flex-start", marginBottom: 12 }}
          />
        ) : null}

        {lead ? (
          <>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a short note (optional)"
              placeholderTextColor={colors.ink.muted}
              maxLength={LEAD_NOTE_MAX}
              style={styles.note}
            />
            <Button
              label="Save note"
              variant="secondary"
              disabled={note.trim() === (lead.note ?? "")}
              onPress={() => onSaveNote(note.trim())}
            />
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  head: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16 },
  close: {
    width: 36,
    height: 36,
    borderRadius: pill(36),
    backgroundColor: colors.disabledFill,
    alignItems: "center",
    justifyContent: "center",
  },
  grades: { flexDirection: "row", gap: 8, marginBottom: 16 },
  grade: {
    flex: 1,
    minHeight: 92,
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.card,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    gap: 4,
  },
  gradeSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  note: {
    height: 48,
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.card,
    color: colors.ink.primary,
    paddingHorizontal: 16,
    fontFamily: FONT_REGULAR,
    fontSize: 15,
    marginBottom: 12,
  },
});
