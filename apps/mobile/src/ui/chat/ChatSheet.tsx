import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import type { Message } from "@knockd/shared";
import { logger } from "@/realtime/logger";
import { useChatStore } from "@/realtime/stores/chatStore";
import { useCrewStore } from "@/realtime/stores/crewStore";
import { sessionActions } from "@/session";
import { colors, FONT_REGULAR, pill, radii } from "@/theme";
import { BottomSheet } from "../BottomSheet";
import { Icon } from "../Icon";
import { Text } from "../Text";

const BODY_MAX = 1000;

/** "7:35 pm". */
export function timeOfDay(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/**
 * Crew chat (README "Live map": group chat). Messages go through the offline queue, so they send
 * when the signal comes back; yours show straight away.
 */
export function ChatSheet({ myId, onClose }: { myId: string | null; onClose: () => void }) {
  const messages = useChatStore((s) => s.messages);
  const crew = useCrewStore((s) => s.members);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  // Open while shown: incoming messages don't count as unread.
  useEffect(() => {
    useChatStore.getState().setChatOpen(true);
    return () => useChatStore.getState().setChatOpen(false);
  }, []);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    setError(null);
    sessionActions.sendMessage(body).catch((cause: unknown) => {
      logger.warn("chat: could not send", cause);
      setText(body);
      setError("Couldn't send that. Try again.");
    });
  };

  const bubble = (m: Message, i: number) => {
    const mine = m.memberId === myId;
    const sender = crew[m.memberId];
    const sameAsBefore = messages[i - 1]?.memberId === m.memberId;
    return (
      <View key={m.clientId} style={[styles.bubbleRow, mine && styles.mineRow]}>
        {!mine && !sameAsBefore ? (
          <Text variant="captionStrong" color={sender?.colour ?? colors.ink.secondary}>
            {sender?.name ?? "A teammate"}
          </Text>
        ) : null}
        <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
          <Text variant="body" color={mine ? colors.ink.onBrand : colors.ink.primary}>
            {m.body}
          </Text>
        </View>
        <Text variant="caption" color={colors.ink.muted}>
          {timeOfDay(m.createdAt)}
        </Text>
      </View>
    );
  };

  return (
    <>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close chat" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
      >
        <BottomSheet style={styles.sheet}>
          <View style={styles.head}>
            <Text variant="title" style={{ fontSize: 20, flex: 1 }}>
              Crew chat
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close chat" onPress={onClose} hitSlop={10}>
              <Icon name="x" size={22} color={colors.ink.secondary} />
            </Pressable>
          </View>
          <ScrollView
            ref={scroll}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          >
            {messages.length === 0 ? (
              <Text variant="label" color={colors.ink.muted} style={styles.empty}>
                No messages yet. Say where you&apos;re headed, or when to meet.
              </Text>
            ) : (
              messages.map(bubble)
            )}
          </ScrollView>
          {error ? (
            <Text variant="label" color={colors.brand} style={styles.error}>
              {error}
            </Text>
          ) : null}
          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Message the crew"
              placeholderTextColor={colors.ink.muted}
              maxLength={BODY_MAX}
              multiline
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={!text.trim()}
              onPress={send}
              style={[styles.send, !text.trim() && styles.sendOff]}
            >
              <Icon name="send" size={18} color={colors.ink.onBrand} />
            </Pressable>
          </View>
        </BottomSheet>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  sheet: { paddingHorizontal: 16, maxHeight: "80%" },
  head: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  list: { flexGrow: 0, minHeight: 120 },
  listContent: { gap: 8, paddingVertical: 4 },
  empty: { textAlign: "center", paddingVertical: 24 },
  bubbleRow: { alignItems: "flex-start", gap: 2, maxWidth: "85%" },
  mineRow: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.row },
  mine: { backgroundColor: colors.brand },
  theirs: { backgroundColor: colors.bg.page },
  error: { marginTop: 6 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 10 },
  input: {
    flex: 1,
    maxHeight: 100,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radii.row,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONT_REGULAR,
    fontSize: 15,
    color: colors.ink.primary,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: pill(44),
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  sendOff: { opacity: 0.4 },
});
