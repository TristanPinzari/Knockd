import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { getAccountToken, useAccountStore } from "@/account/accountStore";
import { useTeamMaps } from "@/account/useTeamMaps";
import type { Layer } from "@knockd/shared";
import { LAYER_COPY } from "@/session/TeamLayersCard";
import { startingArea } from "@/area/workingArea";
import { sessionErrorMessage } from "@/session";
import { getCurrentLatLng } from "@/session/currentLocation";
import { sessionLifecycle } from "@/session/defaultDeps";
import { colors, FONT_REGULAR, radii } from "@/theme";
import { Button, Chip, FlatHeader, Screen, Text } from "@/ui";

const NAME_MAX = 40;
const LAYERS: readonly Layer[] = ["leads", "coverage", "leadRate", "highlights", "notes"];
const NO_LOCATION =
  "Knockd needs your location to start a session here. Turn on location for Knockd in Settings, then try again.";

/**
 * Create session (MOBILE.md screen 3): just your name. The session's area is set from where you're
 * standing and grows on its own as the crew spreads out, so there's nothing to pick. Logged in, you
 * can also load one of your team's maps (previous leads, past coverage, lead-rate colours, the web's
 * highlights and notes) for everyone in the session.
 */
export default function CreateSessionScreen() {
  const router = useRouter();
  const accountName = useAccountStore((s) => s.me?.user.displayName ?? "");
  const [typedName, setName] = useState<string | null>(null);
  const name = typedName ?? accountName;
  const { maps } = useTeamMaps();
  const [mapId, setMapId] = useState<string | null>(null);
  // Previous leads on by default; the rest are optional (README "Loading team data").
  const [layers, setLayers] = useState<readonly Layer[]>(["leads"]);
  const toggle = (layer: Layer) =>
    setLayers((now) => (now.includes(layer) ? now.filter((l) => l !== layer) : [...now, layer]));
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
      await sessionLifecycle.create(
        {
          displayName: name.trim(),
          ...startingArea(here),
          ...(mapId && layers.length > 0 ? { loadMap: { mapId, layers: [...layers] } } : {}),
        },
        await getAccountToken(),
      );
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
        {maps.length > 0 ? (
          <View style={styles.maps}>
            <Text variant="label" color={colors.ink.secondary}>
              Load a team map (optional)
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label="None" selected={mapId === null} onPress={() => setMapId(null)} />
              {maps.map((m) => (
                <Chip
                  key={m.mapId}
                  label={maps.some((o) => o.teamName !== m.teamName) ? `${m.name} · ${m.teamName}` : m.name}
                  selected={mapId === m.mapId}
                  onPress={() => setMapId(m.mapId)}
                />
              ))}
            </ScrollView>
            {mapId ? (
              <View style={styles.layers}>
                {LAYERS.map((layer) => (
                  <Chip
                    key={layer}
                    label={LAYER_COPY[layer].title}
                    height={32}
                    selected={layers.includes(layer)}
                    onPress={() => toggle(layer)}
                  />
                ))}
              </View>
            ) : null}
            <Text variant="caption" color={colors.ink.muted}>
              Everyone in the session sees what you load, and can hide each layer on their own phone.
            </Text>
          </View>
        ) : null}
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
  maps: { marginTop: 20, gap: 8 },
  chips: { gap: 8 },
  layers: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
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
