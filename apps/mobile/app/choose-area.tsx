import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { buildAreaRequest, sessionErrorMessage, type AreaMode } from "@/session";
import { getCurrentLatLng } from "@/session/currentLocation";
import { sessionLifecycle } from "@/session/defaultDeps";
import { colors } from "@/theme";
import { BottomSheet, Button, FlatHeader, Screen, SegmentedControl, StepperTile, Text, stepValue } from "@/ui";
import { AreaOverlay } from "@/ui/placeholders";
import { MapSlot } from "@/ui/slots";

type Mode = AreaMode;
// TODO(auth): use the account's display name once Auth0 login lands.
const HOST_DISPLAY_NAME = "Host";

const MODES = [
  { value: "suggested", label: "Suggested" },
  { value: "radius", label: "Radius" },
  { value: "draw", label: "Draw" },
] as const;

const HINTS: Record<Mode, string> = {
  suggested: "Pick a neighbourhood",
  radius: "Set a radius around the pin",
  draw: "Tap the map to add corners",
};

const MIN_CREW = 1;
const MAX_CREW = 8;
const RADIUS_STEP_KM = 0.25;
const MIN_RADIUS_KM = 0.1;
const MAX_RADIUS_KM = 3;
const HOUSES_PER_KM2 = 151;

export default function ChooseAreaScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("suggested");
  const [crew, setCrew] = useState(4);
  const [suggestion, setSuggestion] = useState(1);
  const [radiusKm, setRadiusKm] = useState(1.25);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const myLocation = await getCurrentLatLng();
      const { location, area } = buildAreaRequest(mode, radiusKm, myLocation);
      await sessionLifecycle.create({ displayName: HOST_DISPLAY_NAME, location, area });
      router.push("/lobby");
    } catch (cause) {
      setError(sessionErrorMessage("create", cause));
    } finally {
      setCreating(false);
    }
  };

  const houses = Math.round(Math.PI * radiusKm * radiusKm * HOUSES_PER_KM2);
  const sheetTitle = mode === "suggested" ? "Old North" : mode === "radius" ? `${radiusKm} km radius` : "Custom area";
  const sheetSub = mode === "suggested" ? "≈ 640 houses" : mode === "radius" ? `≈ ${houses} houses` : "≈ 380 houses";

  return (
    <Screen>
      <MapSlot plain>
        <AreaOverlay kind={mode === "radius" ? "circle" : mode === "draw" ? "draw" : "polygon"} />
      </MapSlot>
      <FlatHeader title="Choose your area" titleVariant="heading">
        <View style={{ marginTop: 12 }}>
          <SegmentedControl options={MODES} value={mode} onChange={setMode} />
        </View>
      </FlatHeader>
      <View style={styles.hintBar}>
        <Text variant="label" color={colors.ink.secondary}>
          {HINTS[mode]}
        </Text>
      </View>

      <BottomSheet>
        <Text variant="heading" style={{ fontSize: 16 }}>
          {sheetTitle}
        </Text>
        <Text variant="caption" color={colors.ink.secondary} style={{ marginBottom: 12 }}>
          {sheetSub}
        </Text>
        <View style={styles.tiles}>
          <StepperTile
            label="Crew"
            valueText={String(crew)}
            onDecrement={() => setCrew((value) => stepValue(value, -1, MIN_CREW, MAX_CREW))}
            onIncrement={() => setCrew((value) => stepValue(value, 1, MIN_CREW, MAX_CREW))}
          />
          {mode === "suggested" ? (
            <StepperTile
              label="Suggested"
              valueText={`${suggestion} of 3`}
              onDecrement={() => setSuggestion((value) => stepValue(value, -1, 1, 3))}
              onIncrement={() => setSuggestion((value) => stepValue(value, 1, 1, 3))}
            />
          ) : null}
          {mode === "radius" ? (
            <StepperTile
              label="Radius"
              valueText={`${radiusKm} km`}
              onDecrement={() =>
                setRadiusKm((value) => stepValue(value, -RADIUS_STEP_KM, MIN_RADIUS_KM, MAX_RADIUS_KM))
              }
              onIncrement={() => setRadiusKm((value) => stepValue(value, RADIUS_STEP_KM, MIN_RADIUS_KM, MAX_RADIUS_KM))}
            />
          ) : null}
          {mode === "draw" ? <StepperTile label="Corners" valueText="6" /> : null}
        </View>
        {error ? (
          <Text variant="label" color={colors.brand} accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <Button label={creating ? "Creating..." : "Create session"} disabled={creating} onPress={() => void create()} />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hintBar: { backgroundColor: colors.bg.page, paddingHorizontal: 24, paddingVertical: 10 },
  tiles: { flexDirection: "row", gap: 12, marginBottom: 16 },
  error: { marginBottom: 12 },
});
