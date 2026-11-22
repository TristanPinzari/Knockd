import * as SecureStore from "expo-secure-store";
import { z } from "zod";
import type { CredentialStore } from "./batchProcessor";

const KEY = "knockd.tracking";
const Stored = z.object({ sessionId: z.string(), token: z.string(), mode: z.enum(["standard", "saver"]) });

/** The session token lives in the OS keychain/keystore, readable by the headless location task. */
export const secureCredentialStore: CredentialStore = {
  save: (credentials) => SecureStore.setItemAsync(KEY, JSON.stringify(credentials)),
  load: async () => {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    try {
      const parsed = Stored.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
  clear: () => SecureStore.deleteItemAsync(KEY),
};
