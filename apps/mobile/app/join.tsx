import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sessionErrorMessage } from "@/session";
import { sessionLifecycle } from "@/session/defaultDeps";
import { colors, FONT_REGULAR, radii } from "@/theme";
import { Button, Icon, Screen, Text } from "@/ui";

const CODE_LENGTH = 6;
const sanitize = (raw: string): string =>
  raw
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, CODE_LENGTH);

export default function JoinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canJoin = code.length === CODE_LENGTH && name.trim().length > 0 && !joining;

  const join = async () => {
    setJoining(true);
    setError(null);
    try {
      await sessionLifecycle.join({ code, displayName: name.trim() });
      router.replace("/lobby");
    } catch (cause) {
      setError(sessionErrorMessage("join", cause));
    } finally {
      setJoining(false);
    }
  };

  return (
    <Screen padTop style={styles.screen}>
      <View style={[styles.brand, { marginTop: 24 }]}>
        <Icon name="map-pin" size={24} color={colors.brand} />
        <Text variant="title">Knockd</Text>
      </View>
      <View style={styles.hero}>
        <Text variant="title" style={styles.headline}>
          See the whole map.
        </Text>
        <Text variant="body" color={colors.ink.secondary}>
          Join your crew on one live map, mark houses as you walk, and see who covers what.
        </Text>
      </View>

      <Text variant="label" color={colors.ink.secondary} style={styles.label}>
        Join code
      </Text>
      <Pressable accessibilityLabel="Join code" onPress={() => inputRef.current?.focus()} style={styles.codeRow}>
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <View key={index} style={[styles.codeBox, index === code.length && styles.codeBoxActive]}>
            <Text variant="title">{code[index] ?? ""}</Text>
          </View>
        ))}
      </Pressable>
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={(next) => {
          setCode(sanitize(next));
          setError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={CODE_LENGTH}
        style={styles.hiddenInput}
      />

      <Text variant="label" color={colors.ink.secondary} style={styles.label}>
        Your name
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Enter your first name"
        placeholderTextColor={colors.ink.muted}
        style={styles.input}
      />
      {error ? (
        <Text variant="label" color={colors.brand} accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button
        label={joining ? "Joining..." : "Join session"}
        disabled={!canJoin}
        onPress={() => void join()}
        style={styles.join}
      />
      <View style={styles.orRow}>
        <View style={styles.rule} />
        <Text variant="label" color={colors.ink.muted}>
          or
        </Text>
        <View style={styles.rule} />
      </View>
      <Button label="Log in or create a team" variant="secondary" onPress={() => router.replace("/(tabs)")} />
      <View style={{ height: insets.bottom }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 24 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  hero: { marginTop: 56, marginBottom: 32, gap: 8 },
  headline: { fontSize: 28, lineHeight: 36 },
  label: { marginBottom: 8, marginTop: 4 },
  codeRow: { flexDirection: "row", gap: 9, marginBottom: 16 },
  codeBox: {
    flex: 1,
    height: 54,
    borderRadius: radii.row,
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    alignItems: "center",
    justifyContent: "center",
  },
  codeBoxActive: { borderColor: colors.ink.primary },
  hiddenInput: { position: "absolute", opacity: 0, height: 1, width: 1 },
  input: {
    height: 54,
    borderRadius: radii.row,
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    paddingHorizontal: 16,
    fontFamily: FONT_REGULAR,
    fontSize: 14,
    color: colors.ink.primary,
    marginBottom: 16,
  },
  join: { marginBottom: 16 },
  error: { marginTop: -8, marginBottom: 12 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border.default },
});
