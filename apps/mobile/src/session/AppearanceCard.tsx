import { useState } from "react";
import { DevSettings } from "react-native";
import { logger } from "@/realtime/logger";
import {
  colors,
  COLOR_SCHEME,
  readAppearancePreference,
  saveAppearancePreference,
  themes,
  type AppearancePreference,
} from "@/theme";
import { Card, SegmentedControl, Text } from "@/ui";

const OPTIONS: readonly { value: AppearancePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: themes.light.label },
  { value: "dark", label: themes.dark.label },
];

/** The theme is chosen when the app starts, so a new choice is saved and then the app reloads. */
function reloadApp(): boolean {
  if (!__DEV__) return false;
  DevSettings.reload();
  return true;
}

/** Settings → Appearance: System (follow the phone), Light or Dark. */
export function AppearanceCard() {
  const [preference, setPreference] = useState<AppearancePreference>(readAppearancePreference);
  const [note, setNote] = useState<string | null>(null);

  const choose = async (next: AppearancePreference): Promise<void> => {
    setPreference(next);
    try {
      await saveAppearancePreference(next);
      if (!reloadApp()) setNote("Close and reopen Knockd to switch themes.");
    } catch (error) {
      logger.warn("appearance: could not save the choice", error);
      setNote("Couldn't save that. Try again.");
    }
  };

  return (
    <Card>
      <SegmentedControl
        options={OPTIONS}
        value={preference}
        onChange={(next) => void choose(next)}
        tone="light"
        height={36}
      />
      <Text variant="caption" color={colors.ink.secondary} style={{ marginTop: 12 }}>
        {note ?? `Using the ${themes[COLOR_SCHEME].label.toLowerCase()} theme.`}
      </Text>
    </Card>
  );
}
