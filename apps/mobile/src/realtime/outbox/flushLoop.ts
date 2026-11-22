import { logger } from "../logger";
import type { OutboxFlusher } from "./flusher";

export interface FlushLoopOptions {
  flusher: OutboxFlusher;
  sessionId: string;
  token: string;
  intervalMs: number;
}

export interface FlushLoop {
  /** Flush now (e.g. on socket reconnect or app foreground) without waiting for the next tick. */
  kick(): Promise<void>;
  stop(): void;
}

/** Flushes the outbox on a fixed interval while a session is live. Errors never escape the timer. */
export function startFlushLoop({ flusher, sessionId, token, intervalMs }: FlushLoopOptions): FlushLoop {
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      await flusher.flush(sessionId, token);
    } catch (error) {
      logger.warn("flush loop: flush threw", error);
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  return {
    kick: tick,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
