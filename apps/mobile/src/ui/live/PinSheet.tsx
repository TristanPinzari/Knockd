import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { PIN_LABEL_MAX, type Pin } from "@knockd/shared";
import { colors, FONT_REGULAR, radii } from "@/theme";
import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { Chip } from "../Chip";
import { Text } from "../Text";
import { timeOfDay } from "../chat/ChatSheet";

/** Quick labels for the usual reasons to drop a pin. */
const SUGGESTED = ["Meet up here once done", "Heading here", "Car's here"];

export type PinSheetMode =
  | { readonly kind: "new"; readonly at: { readonly lat: number; readonly lng: number } }
  | { readonly kind: "view"; readonly pin: Pin; readonly byName: string; readonly byColour: string };

interface PinSheetProps {
  readonly mode: PinSheetMode;
  readonly onDrop: (label: string) => void;
  readonly onRemove: (clientId: string) => void;
  readonly onClose: () => void;
}

/**
 * Drop a pin (long-press empty map) with an optional short label, or look at one (tap it) and
 * remove it. Anyone in the session can remove any pin.
 */
export function PinSheet({ mode, onDrop, onRemove, onClose }: PinSheetProps) {
  const [label, setLabel] = useState("");
  return (
    <>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <BottomSheet style={styles.sheet}>
        {mode.kind === "new" ? (
          <>
            <Text variant="heading">Drop a pin</Text>
            <Text variant="label" color={colors.ink.secondary} style={styles.sub}>
              Everyone sees it. Add a few words if it helps (optional).
            </Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder='e.g. "Meet up here once done"'
              placeholderTextColor={colors.ink.muted}
              maxLength={PIN_LABEL_MAX}
              style={styles.input}
            />
            <View style={styles.chips}>
              {SUGGESTED.map((s) => (
                <Chip key={s} label={s} height={32} selected={label === s} onPress={() => setLabel(s)} />
              ))}
            </View>
            <Button label="Drop pin" onPress={() => onDrop(label.trim())} />
          </>
        ) : (
          <>
            <View style={styles.titleRow}>
              <View style={[styles.dot, { backgroundColor: mode.byColour }]} />
              <Text variant="heading" style={{ flex: 1 }}>
                {mode.pin.label || "Pin"}
              </Text>
            </View>
            <Text variant="label" color={colors.ink.secondary} style={styles.sub}>
              Dropped by {mode.byName} at {timeOfDay(mode.pin.createdAt)}
            </Text>
            <Button label="Remove pin" variant="secondary" onPress={() => onRemove(mode.pin.clientId)} />
          </>
        )}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  sheet: { paddingHorizontal: 16 },
  sub: { marginTop: 2, marginBottom: 12 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radii.row,
    paddingHorizontal: 12,
    fontFamily: FONT_REGULAR,
    fontSize: 15,
    color: colors.ink.primary,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
