import { createApp } from "./app";
import { startApiServer } from "./api-server";
import { createClerkAuth } from "./middleware/auth";
import { createDatabase } from "./db";
import { createProductionLogger, parseLogLevel, type Logger } from "./logging";
import { superviseApiProcess, type ProcessRuntime } from "./process-failures";
import { createGenericSourceInspector } from "./source-inspections/generic-inspector";
import { createGuardedPublicTransport } from "./source-inspections/guarded-transport";
import {
  createNodeConnectionTransport,
  createNodeHostResolver,
} from "./source-inspections/node-network";
import {
  createSourceInspectionService,
  parseSourceInspectionDisabled,
  parseSourceInspectionDeniedHostnames,
} from "./source-inspections/service";
import { createYouTubeTitleInspector } from "./source-inspections/youtube-title-inspector";

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
    const publicOrigin = process.env.PUBLIC_ORIGIN;
    if (publicOrigin === undefined) {
      throw new Error("PUBLIC_ORIGIN is required");
    }

    const port = Number(process.env.PORT ?? 3001);
    const db = createDatabase(connectionString);
    const publicTransport = createGuardedPublicTransport({
      resolver: createNodeHostResolver(),
      connection: createNodeConnectionTransport(),
    });

    // The API process no longer touches the schema (#104, ADR-0015). Migrations
    // run as a one-shot step gated ahead of this service in the deploy path.
    const app = createApp(db, createClerkAuth(db, publicOrigin), {
      logger,
      diagnosticSecrets,
      sourceInspectionService: createSourceInspectionService({
        disabled: parseSourceInspectionDisabled(
          process.env.SOURCE_INSPECTION_DISABLED,
        ),
        youtubeTitlesDisabled: parseSourceInspectionDisabled(
          process.env.SOURCE_INSPECTION_YOUTUBE_OEMBED_DISABLED,
        ),
        deniedHostnames: parseSourceInspectionDeniedHostnames(
          process.env.SOURCE_INSPECTION_DENIED_HOSTNAMES,
        ),
        inspectGeneric: createGenericSourceInspector({
          transport: publicTransport,
        }),
        inspectYouTubeTitle: createYouTubeTitleInspector({
          transport: publicTransport,
        }),
      }),
    });

    return startApiServer(app, port, logger);
  },
});
