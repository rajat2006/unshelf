import { serializeFailure } from "../diagnostics";
import type { Logger } from "../logging";
import type { DiscoverAcquisitionTick } from "./scheduled-acquisition";

const SCHEDULER_TICK_MILLISECONDS = 60_000;

export interface DiscoverScheduler {
  start(): void;
  stop(): void;
}

/** Own the in-process cadence around the callable scheduled-acquisition tick. */
export function createDiscoverScheduler({
  tick,
  logger,
  intervalMilliseconds = SCHEDULER_TICK_MILLISECONDS,
}: {
  tick: DiscoverAcquisitionTick;
  logger: Logger;
  intervalMilliseconds?: number;
}): DiscoverScheduler {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await tick();
    } catch (error) {
      logger.error({
        event: "unshelf.discover.scheduler.failed",
        msg: "Discover scheduler tick failed",
        ...serializeFailure(error),
      });
    } finally {
      running = false;
    }
  };

  return {
    start: () => {
      if (timer) return;
      void run();
      timer = setInterval(() => void run(), intervalMilliseconds);
      timer.unref();
    },
    stop: () => {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    },
  };
}
