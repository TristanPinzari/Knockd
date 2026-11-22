/**
 * Welcome, logged in: your ended sessions from the last 7 days that aren't on all your teams' maps
 * yet, so one skipped on the day (or a phone that died) can still be added. The server keeps
 * sessions for 7 days.
 */
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { GetMySessionsRes } from "@knockd/shared";
import { logger } from "../realtime/logger";
import { getRuntime } from "../realtime/runtime";
import { colors, radii } from "../theme";
import { Text } from "../ui/Text";
import { getAccountToken, useAccountStore } from "./accountStore";
import { AddToTeam } from "./AddToTeam";

type MySession = GetMySessionsRes["sessions"][number];

/** Shown at most, newest first. */
const MAX_SHOWN = 3;

/** "Sat 5:05 pm". */
export function sessionWhen(iso: string): string {
  const d = new Date(iso);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  const h = d.getHours();
  return `${day} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** Ended sessions not yet on every one of your teams, newest first. */
export function sessionsToAdd(sessions: readonly MySession[], teamIds: readonly string[]): MySession[] {
  return sessions
    .filter((s) => s.status !== "live" && teamIds.some((t) => !s.uploadedTo.includes(t)))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, MAX_SHOWN);
}

export function RecentSessions() {
  const me = useAccountStore((s) => s.me);
  const [sessions, setSessions] = useState<readonly MySession[]>([]);
  const userId = me?.user.id ?? null;

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getAccountToken();
        if (!token) return;
        const res = await (await getRuntime()).api.getMySessions(token);
        if (!cancelled) setSessions(res.sessions);
      } catch (error) {
        logger.warn("account: could not load recent sessions", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!me || me.teams.length === 0) return null;
  const toAdd = sessionsToAdd(
    sessions,
    me.teams.map((t) => t.id),
  );
  if (toAdd.length === 0) return null;

  return (
    <View style={styles.box}>
      <Text variant="heading">Not on your team&apos;s map yet</Text>
      {toAdd.map((s) => (
        <View key={s.id} style={styles.item}>
          <Text variant="label" color={colors.ink.secondary}>
            Session from {sessionWhen(s.startedAt)}
          </Text>
          <AddToTeam session={{ sessionId: s.id, linked: true }} alreadyIn={s.uploadedTo} compact />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, marginTop: 8, marginBottom: 16 },
  item: { gap: 6, padding: 12, borderRadius: radii.row, backgroundColor: colors.bg.card },
});
