import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { colors, FONT_REGULAR, radii } from "@/theme";
import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { Text } from "../Text";

const NOTE_MAX = 140;

interface NoteSheetProps {
  readonly initialText: string;
  /** Editing an existing note: shows Delete. */
  readonly editing: boolean;
  readonly colour: string;
  readonly onSave: (text: string) => void;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}

/** Write or edit a short note on the map (max 140 characters). */
export function NoteSheet({ initialText, editing, colour, onSave, onDelete, onClose }: NoteSheetProps) {
  const [text, setText] = useState(initialText);
  const trimmed = text.trim();
  return (
    <>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close note" />
      <BottomSheet>
        <View style={styles.titleRow}>
          <View style={[styles.dot, { backgroundColor: colour }]} />
          <Text variant="heading">{editing ? "Edit note" : "New note"}</Text>
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder='e.g. "Meet at the car at 7"'
          placeholderTextColor={colors.ink.muted}
          maxLength={NOTE_MAX}
          autoFocus
          multiline
          style={styles.input}
        />
        <Text variant="caption" color={colors.ink.muted} style={styles.count}>
          {trimmed.length}/{NOTE_MAX}
        </Text>
        <Button label="Save" disabled={!trimmed || trimmed === initialText.trim()} onPress={() => onSave(trimmed)} />
        {editing ? <Button label="Delete note" variant="ghost" onPress={onDelete} style={styles.delete} /> : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radii.row,
    padding: 12,
    fontFamily: FONT_REGULAR,
    fontSize: 15,
    color: colors.ink.primary,
    textAlignVertical: "top",
  },
  count: { alignSelf: "flex-end", marginTop: 4, marginBottom: 12 },
  delete: { marginTop: 4 },
});
