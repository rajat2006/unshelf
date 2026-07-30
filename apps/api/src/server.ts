// PROTOTYPE: multi-workspace staged-hook timing probe.
import { createApp } from "./app";
import { startApiServer } from "./api-server";
import { createClerkAuth } from "./middleware/auth";
import { createDatabase } from "./db";
import { createProductionLogger, parseLogLevel, type Logger } from "./logging";
import { superviseApiProcess, type ProcessRuntime } from "./process-failures";

let logger: Logger;
let logConfigurationFailure: unknown;
try {
  logger = createProductionLogger({
    level: parseLogLevel(process.env.LOG_LEVEL),
  });
} catch (failure) {
  // A valid bootstrap logger is required to report invalid LOG_LEVEL as the
  // startup failure it is; startup still terminates non-zero below.
  logger = createProductionLogger({ level: "info" });
  logConfigurationFailure = failure;
}

const diagnosticSecrets = [
  process.env.DATABASE_URL,
  process.env.CLERK_SECRET_KEY,
].filter((value): value is string => value !== undefined);

const runtime: ProcessRuntime = {
  once: (signal, listener) =>
    process.once(signal, (failure) => {
      void listener(failure);
    }),
  exit: (code) => process.exit(code),
};

await superviseApiProcess({
  logger,
  runtime,
  diagnosticSecrets,
  start: () => {
    if (logConfigurationFailure !== undefined) {
      throw logConfigurationFailure instanceof Error
        ? logConfigurationFailure
        : new Error("Invalid log configuration", {
            cause: logConfigurationFailure,
          });
    }

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }

    // Clerk needs its keys to verify sessions on protected routes.
    // `clerkMiddleware` reads them from the environment; fail fast rather than
    // 500-ing on the first authenticated request.
    if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
      throw new Error(
        "CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY are required",
      );
    }

    const port = Number(process.env.PORT ?? 3001);
    const db = createDatabase(connectionString);

    // The API process no longer touches the schema (#104, ADR-0015). Migrations
    // run as a one-shot step gated ahead of this service in the deploy path.
    const app = createApp(db, createClerkAuth(db), {
      logger,
      diagnosticSecrets,
    });

    return startApiServer(app, port, logger);
  },
});
