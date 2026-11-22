import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { logger } from "../realtime/logger";
import { getRuntime } from "../realtime/runtime";
import type { ActiveSession } from "../session/activeSessionStore";
import { colors } from "../theme";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";
import { getAccountToken, useAccountStore } from "./accountStore";

type Status = "adding" | "added" | "failed";

/**
 * "Add to High Five Painting?" on End of day (README "Uploading to a team"). Needs the session to
 * have been created or joined while logged in. Adding twice is harmless (the server keeps one).
 */
export function AddToTeam({ session }: { session: ActiveSession }) {
  const { available, loggedIn, me } = useAccountStore();
  const [status, setStatus] = useState<Record<string, Status>>({});
  if (!available) return null;

  const note = (text: string) => (
    <Text variant="label" color={colors.ink.muted} style={styles.note}>
      {text}
    </Text>
  );
  if (!loggedIn) return note("Log in before your next session to add it to your team's map.");
  if (!session.linked) return note("You weren't logged in when this session started, so it can't be added to a team.");
  if (!me) return null;
  if (me.teams.length === 0) return note("Make a team on knockd.rodeo to keep your sessions on a map.");

  const add = async (teamId: string) => {
    setStatus((s) => ({ ...s, [teamId]: "adding" }));
    try {
      const token = await getAccountToken();
      if (!token) throw new Error("Not logged in");
      await (await getRuntime()).api.uploadSession(teamId, session.sessionId, token);
      setStatus((s) => ({ ...s, [teamId]: "added" }));
    } catch (error) {
      logger.warn("end of day: could not add the session to the team", error);
      setStatus((s) => ({ ...s, [teamId]: "failed" }));
    }
  };

  return (
    <View style={styles.box}>
      <Text variant="heading">Add to your team&apos;s map</Text>
      {me.teams.map((t) => {
        const s = status[t.id];
        return (
          <View key={t.id} style={styles.row}>
            <Button
              label={
                s === "added"
                  ? `Added to ${t.name}`
                  : s === "adding"
                    ? "Adding..."
                    : s === "failed"
                      ? `Try again: ${t.name}`
                      : `Add to ${t.name}`
              }
              variant={s === "added" ? "secondary" : "primary"}
              disabled={s === "adding" || s === "added"}
              onPress={() => void add(t.id)}
            />
          </View>
        );
      })}
      {Object.values(status).includes("failed") ? note("Couldn't add it. Check your signal and try again.") : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 20, gap: 10 },
  row: { gap: 4 },
  note: { marginTop: 16, textAlign: "center" },
});
