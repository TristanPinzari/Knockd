import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { startingArea } from "@/area/workingArea";
import { sessionErrorMessage } from "@/session";
import { getCurrentLatLng } from "@/session/currentLocation";
import { sessionLifecycle } from "@/session/defaultDeps";
import { colors, FONT_REGULAR, radii } from "@/theme";
import { Button, FlatHeader, Screen, Text } from "@/ui";

const NAME_MAX = 40;
const NO_LOCATION =
  "Knockd needs your location to start a session here. Turn on location for Knockd in Settings, then try again.";

/**
 * Create session (MOBILE.md screen 3): just your name. The session's area is set from where you're
 * standing and grows on its own as the crew spreads out, so there's nothing to pick.
 */
export default function CreateSessionScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = name.trim().length > 0 && !creating;

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const here = await getCurrentLatLng();
      if (!here) {
        setError(NO_LOCATION);
        return;
      }
      await sessionLifecycle.create({ displayName: name.trim(), ...startingArea(here) });
      router.replace("/lobby");
    } catch (cause) {
      setError(sessionErrorMessage("create", cause));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Screen>
      <FlatHeader title="Start a session" titleVariant="heading" />
      <View style={styles.body}>
        <Text variant="label" color={colors.ink.secondary}>
          Your name
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Enter your first name"
          placeholderTextColor={colors.ink.muted}
          autoCapitalize="words"
          autoFocus
          maxLength={NAME_MAX}
          returnKeyType="go"
          onSubmitEditing={() => canCreate && void create()}
          style={styles.input}
        />
        <Text variant="caption" color={colors.ink.secondary}>
          You&apos;ll get a code to share with your crew.
        </Text>
        {error ? (
          <Text variant="label" color={colors.brand} accessibilityRole="alert" style={{ marginTop: 12 }}>
            {error}
          </Text>
        ) : null}
        <Button
          label={creating ? "Creating..." : "Create session"}
          disabled={!canCreate}
          onPress={() => void create()}
          style={{ marginTop: 24 }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 24, paddingTop: 24 },
  input: {
    height: 48,
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.card,
    color: colors.ink.primary,
    paddingHorizontal: 16,
    fontFamily: FONT_REGULAR,
    fontSize: 16,
    marginTop: 6,
    marginBottom: 8,
  },
});
