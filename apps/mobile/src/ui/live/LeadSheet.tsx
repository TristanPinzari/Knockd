import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { LEAD_NOTE_MAX } from "@knockd/shared";
import { gradeOptions } from "@/mock";
import { colors, FONT_REGULAR, pill, radii } from "@/theme";
import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Text } from "../Text";

interface LeadSheetProps {
  address?: string;
  detail?: string;
  onClose: () => void;
  onSave: (grade: "A" | "B" | "C", note: string) => void;
}

/** 07b: grade A/B/C plus optional note. The only door sheet (no other statuses). */
export function LeadSheet({ address = "42 Oak St", detail = "Left side, 40 m", onClose, onSave }: LeadSheetProps) {
  const [grade, setGrade] = useState<"A" | "B" | "C">("A");
  const [note, setNote] = useState("");

  return (
    <>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <BottomSheet style={{ paddingHorizontal: 16 }}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text variant="title" style={{ fontSize: 20 }}>
              {address}
            </Text>
            <Text variant="label" color={colors.ink.secondary}>
              {detail}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
            <Icon name="x" size={20} color={colors.ink.primary} />
          </Pressable>
        </View>
        <View style={styles.leadChip}>
          <Icon name="star" size={16} color={colors.ink.onBrand} />
          <Text variant="bodyStrong" color={colors.ink.onBrand}>
            Lead
          </Text>
        </View>
        <Text variant="bodyStrong" style={{ marginVertical: 12 }}>
          How warm is this lead?
        </Text>
        <View style={{ gap: 10 }}>
          {gradeOptions.map((option) => {
            const selected = option.grade === grade;
            return (
              <Pressable
                key={option.grade}
                onPress={() => setGrade(option.grade)}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <View style={[styles.badge, selected && { backgroundColor: colors.ink.primary }]}>
                  <Text variant="bodyStrong" color={selected ? colors.ink.onBrand : colors.ink.primary}>
                    {option.grade}
                  </Text>
                </View>
                <Text variant="body" style={{ flex: 1 }}>
                  {option.text}
                </Text>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={note}
          onChangeText={setNote}
          maxLength={LEAD_NOTE_MAX}
          placeholder="Add a short note (optional)"
          placeholderTextColor={colors.ink.muted}
          style={styles.note}
        />
        <Button label="Save lead" onPress={() => onSave(grade, note.trim())} />
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  head: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg.page,
    alignItems: "center",
    justifyContent: "center",
  },
  leadChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: pill(36),
    backgroundColor: colors.brand,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    height: 64,
    paddingHorizontal: 14,
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  optionSelected: { borderWidth: 2, borderColor: colors.ink.primary },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg.page,
    alignItems: "center",
    justifyContent: "center",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: colors.ink.primary },
  radioDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.ink.primary },
  note: {
    height: 52,
    borderRadius: radii.row,
    backgroundColor: colors.bg.page,
    paddingHorizontal: 16,
    marginVertical: 12,
    fontFamily: FONT_REGULAR,
    fontSize: 14,
    color: colors.ink.primary,
  },
});
