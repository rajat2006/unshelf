import { describe, expect, it, vi } from "vitest";
import {
  createCollectingLogger,
  type CollectingLogger,
  type Logger,
} from "../src/logger";
import {
  superviseApiProcess,
  type ProcessRuntime,
} from "../src/process-failures";

describe("API process failure policy", () => {
  it("flushes a fatal startup failure before preserving a non-zero outcome", async () => {
    const logger = trackedLogger();
    const runtime = fakeRuntime();
    const failure = Object.assign(
      new Error("could not bind retained-startup-context using startup-secret"),
      {
        code: "EADDRINUSE",
      },
    );

    await superviseApiProcess({
      logger,
      runtime,
      diagnosticSecrets: ["startup-secret"],
      start: () => {
        throw failure;
      },
    });

    expect(logger.records).toEqual([
      {
        level: "fatal",
        event: "unshelf.api.error.unexpected",
        msg: "Unexpected API process failure",
        phase: "startup",
        error: expect.objectContaining({
          type: "Error",
          code: "EADDRINUSE",
          message:
            "could not bind retained-startup-context using [REDACTED]",
        }),
      },
    ]);
    expect(logger.flush).toHaveBeenCalledOnce();
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(logger.flush.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.exit.mock.invocationCallOrder[0]!,
    );
  });

  it.each([
    ["uncaughtException", new Error("retained uncaught context")],
    ["unhandledRejection", { reason: "retained rejection context" }],
  ] as const)(
    "flushes a fatal runtime failure for %s before exiting non-zero",
    async (signal, failure) => {
      const logger = trackedLogger();
      const runtime = fakeRuntime();
      await superviseApiProcess({
        logger,
        runtime,
        start: () => fakeServer(),
      });

      await runtime.emit(signal, failure);

      expect(logger.records).toEqual([
        {
          level: "fatal",
          event: "unshelf.api.error.unexpected",
          msg: "Unexpected API process failure",
          phase: "runtime",
          error:
            failure instanceof Error
              ? expect.objectContaining({
                  type: "Error",
                  message: "retained uncaught context",
                })
              : {
                  type: "NonErrorThrow",
                  value: {
                    reason: "retained rejection context",
                  },
                },
        },
      ]);
      expect(logger.flush).toHaveBeenCalledOnce();
      expect(runtime.exit).toHaveBeenCalledWith(1);
      expect(logger.flush.mock.invocationCallOrder[0]).toBeLessThan(
        runtime.exit.mock.invocationCallOrder[0]!,
      );
    },
  );
});

function trackedLogger(): CollectingLogger & {
  flush: ReturnType<typeof vi.fn<Logger["flush"]>>;
} {
  const logger = createCollectingLogger();
  return {
    ...logger,
    flush: vi.fn(async () => undefined),
  };
}

type RuntimeSignal = "uncaughtException" | "unhandledRejection";

function fakeRuntime(): ProcessRuntime & {
  exit: ReturnType<typeof vi.fn>;
  emit(signal: RuntimeSignal, failure: unknown): Promise<void>;
} {
  const listeners = new Map<
    RuntimeSignal,
    (failure: unknown) => void | Promise<void>
  >();
  return {
    once: (signal, listener) => {
      listeners.set(signal, listener);
    },
    exit: vi.fn(),
    async emit(signal, failure) {
      await listeners.get(signal)?.(failure);
    },
  };
}

function fakeServer(): {
  once(signal: "error", listener: (failure: unknown) => void): void;
} {
  return {
    once: () => undefined,
  };
}
