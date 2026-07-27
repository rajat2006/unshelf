import { createApp } from "./app";
import { startApiServer } from "./api-server";
import { createClerkAuth } from "./auth";
import { createDatabase } from "./db";
import { createProductionLogger, parseLogLevel } from "./logger";

const logger = createProductionLogger({
  level: parseLogLevel(process.env.LOG_LEVEL),
});

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

// Clerk needs its keys to verify sessions on protected routes. `clerkMiddleware`
// reads them from CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY in the environment;
// fail fast here rather than 500-ing on the first authenticated request.
if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
  throw new Error("CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY are required");
}

const port = Number(process.env.PORT ?? 3001);
const db = createDatabase(connectionString);

// The API process no longer touches the schema (#104, ADR-0015). Migrations run
// as a one-shot step gated ahead of this service in the deploy path, so a failed
// migration fails the *deploy* rather than restart-looping a live service.
const app = createApp(db, createClerkAuth(db));

startApiServer(app, port, logger);
