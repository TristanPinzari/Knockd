import { create } from "zustand";
import type { Message } from "@knockd/shared";

interface ChatState {
  /** Oldest first. */
  messages: readonly Message[];
  unread: number;
  chatOpen: boolean;
  hasSeeded: boolean;
  /** Snapshot or catch-up. After the first seed, messages from others we have not seen count as unread. */
  seed: (messages: readonly Message[], myMemberId: string | null) => void;
  /** Live message. Own messages and duplicates (same clientId) never add unread. */
  receive: (message: Message, myMemberId: string | null) => void;
  setChatOpen: (open: boolean) => void;
  reset: () => void;
}

function addMessages(
  existing: readonly Message[],
  incoming: readonly Message[],
): { messages: readonly Message[]; added: readonly Message[] } {
  const seen = new Set(existing.map((m) => m.clientId));
  const added = incoming.filter(
    (m, i) => !seen.has(m.clientId) && incoming.findIndex((x) => x.clientId === m.clientId) === i,
  );
  if (added.length === 0) return { messages: existing, added };
  const messages = [...existing, ...added].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return { messages, added };
}

const unreadFrom = (added: readonly Message[], me: string | null): number =>
  added.filter((m) => m.memberId !== me).length;

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  unread: 0,
  chatOpen: false,
  hasSeeded: false,
  seed: (incoming, me) =>
    set((s) => {
      const { messages, added } = addMessages(s.messages, incoming);
      const extra = s.hasSeeded && !s.chatOpen ? unreadFrom(added, me) : 0;
      return { messages, hasSeeded: true, unread: s.unread + extra };
    }),
  receive: (message, me) =>
    set((s) => {
      const { messages, added } = addMessages(s.messages, [message]);
      return { messages, unread: s.unread + (s.chatOpen ? 0 : unreadFrom(added, me)) };
    }),
  setChatOpen: (chatOpen) => set((s) => ({ chatOpen, unread: chatOpen ? 0 : s.unread })),
  reset: () => set({ messages: [], unread: 0, chatOpen: false, hasSeeded: false }),
}));
