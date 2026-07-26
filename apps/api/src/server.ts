import { createApp } from "./app";
import { createClerkAuth } from "./auth";
import { createPool } from "./db";

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
const pool = createPool(connectionString);

// The API process no longer touches the schema (#104, ADR-0015). Migrations run
// as a one-shot step gated ahead of this service in the deploy path, so a failed
// migration fails the *deploy* rather than restart-looping a live service.
const app = createApp(pool, createClerkAuth(pool));

app.listen(port, () => {
  console.log(`unshelf api listening on :${port}`);
});
