import { afterEach, describe, expect, it, vi } from "vitest";
import { createCollectingLogger } from "../logging/testing";
import { createDiscoverScheduler } from "./scheduler";

afterEach(() => {
  vi.useRealTimers();
});

describe("Discover scheduler", () => {
  it("starts immediately, keeps one cadence, and stops future ticks", async () => {
    vi.useFakeTimers();
    const tick = vi.fn().mockResolvedValue(undefined);
    const scheduler = createDiscoverScheduler({
      tick,
      logger: createCollectingLogger(),
      intervalMilliseconds: 60_000,
    });

    scheduler.start();
    scheduler.start();
    await vi.waitFor(() => expect(tick).toHaveBeenCalledOnce());

    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(2);

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("reports one failed tick and continues on the next cadence", async () => {
    vi.useFakeTimers();
    const logger = createCollectingLogger();
    const tick = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValue(undefined);
    const scheduler = createDiscoverScheduler({
      tick,
      logger,
      intervalMilliseconds: 60_000,
    });

    scheduler.start();
    await vi.waitFor(() => expect(logger.records).toHaveLength(1));
    expect(logger.records[0]).toMatchObject({
      level: "error",
      event: "unshelf.discover.scheduler.failed",
      msg: "Discover scheduler tick failed",
    });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });
});
