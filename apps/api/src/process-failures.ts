import { serializeFailure } from "./diagnostics";
import type { Logger } from "./logger";

type RuntimeSignal = "uncaughtException" | "unhandledRejection";

export interface ProcessRuntime {
  once(
    signal: RuntimeSignal,
    listener: (failure: unknown) => void | Promise<void>,
  ): unknown;
  exit(code: number): unknown;
}

export interface StartupTarget {
  once(
    signal: "error" | "listening",
    listener:
      | ((failure: unknown) => void | Promise<void>)
      | (() => void),
  ): unknown;
}

export interface ApiProcessOptions<T extends StartupTarget> {
  readonly logger: Logger;
  readonly runtime: ProcessRuntime;
  readonly start: () => T;
  readonly diagnosticSecrets?: readonly string[];
}

export async function superviseApiProcess<T extends StartupTarget>({
  logger,
  runtime,
  start,
  diagnosticSecrets,
}: ApiProcessOptions<T>): Promise<T | undefined> {
  let termination: Promise<void> | undefined;
  const terminate = (
    phase: "startup" | "runtime",
    failure: unknown,
  ): Promise<void> => {
    termination ??= (async () => {
      try {
        logger.fatal({
          event: "unshelf.api.error.unexpected",
          msg: "Unexpected API error",
          phase,
          ...serializeFailure(failure, {
            secrets: diagnosticSecrets,
          }),
        });
      } finally {
        try {
          await logger.flush();
        } finally {
          runtime.exit(1);
        }
      }
    })();
    return termination;
  };

  runtime.once("uncaughtException", (failure) =>
    terminate("runtime", failure),
  );
  runtime.once("unhandledRejection", (failure) =>
    terminate("runtime", failure),
  );

  try {
    const server = start();
    let listening = false;
    server.once("listening", () => {
      listening = true;
    });
    server.once("error", (failure) =>
      terminate(listening ? "runtime" : "startup", failure),
    );
    return server;
  } catch (failure) {
    await terminate("startup", failure);
    return undefined;
  }
}
