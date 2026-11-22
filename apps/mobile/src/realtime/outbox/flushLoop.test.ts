import { afterEach, describe, expect, it, vi } from "vitest";
import { startFlushLoop } from "./flushLoop";

afterEach(() => vi.useRealTimers());

describe("startFlushLoop", () => {
  it("flushes on the interval, can be kicked, survives errors and stops", async () => {
    vi.useFakeTimers();
    const flush = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("boom")).mockResolvedValue({});
    const loop = startFlushLoop({ flusher: { flush }, sessionId: "s", token: "t", intervalMs: 15_000 });
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(flush).toHaveBeenCalledTimes(2);
    await loop.kick();
    expect(flush).toHaveBeenCalledTimes(3);
    loop.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    await loop.kick();
    expect(flush).toHaveBeenCalledTimes(3);
  });
});
