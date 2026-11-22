/**
 * Session menu → the loaded team map: one switch per layer the session creator loaded. Each person
 * switches their own (README: so the map doesn't get cluttered); it changes nothing for anyone else.
 */
import { Fragment } from "react";
import { View } from "react-native";
import type { Layer } from "@knockd/shared";
import { useSessionStore } from "../realtime/stores/sessionStore";
import { colors } from "../theme";
import { Card, Divider, SectionLabel } from "../ui/SettingsParts";
import { Switch } from "../ui/Switch";
import { Text } from "../ui/Text";
import { useSessionUi } from "./uiStore";

export const LAYER_COPY: Readonly<Record<Layer, { title: string; detail: string }>> = {
  leads: { title: "Previous leads", detail: "Hollow rings: houses graded in past sessions" },
  coverage: { title: "Past coverage", detail: "Streets worked before, fading with age" },
  leadRate: { title: "Lead-rate colours", detail: "Blocks from red (weakest) to green (best)" },
  highlights: { title: "Highlights", detail: "Areas and roads marked on the website" },
  notes: { title: "Team notes", detail: "Notes left on the website" },
};

export function TeamLayersCard() {
  const loadedMap = useSessionStore((s) => s.loadedMap);
  const hidden = useSessionUi((s) => s.hiddenLayers);
  if (!loadedMap || loadedMap.layers.length === 0) return null;
  return (
    <>
      <SectionLabel>{`Team map: ${loadedMap.name}`}</SectionLabel>
      <Card>
        {loadedMap.layers.map((layer, i) => (
          <Fragment key={layer}>
            {i > 0 ? <Divider /> : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" style={{ fontSize: 15 }}>
                  {LAYER_COPY[layer].title}
                </Text>
                <Text variant="caption" color={colors.ink.secondary}>
                  {LAYER_COPY[layer].detail}
                </Text>
              </View>
              <Switch
                value={!hidden.includes(layer)}
                onValueChange={() => useSessionUi.getState().toggleLayer(layer)}
              />
            </View>
          </Fragment>
        ))}
      </Card>
    </>
  );
}
