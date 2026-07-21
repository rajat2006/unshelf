import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * `drizzle-kit` config. `generate` diffs `src/schema.ts` against the snapshot in
 * `drizzle/meta/` and writes a versioned `.sql` — which is reviewed and
 * committed like any other code. `drizzle-kit push` is deliberately never used:
 * it applies a schema diff with no file, no history and no record of what ran,
 * which is the exact pain retiring `SCHEMA_SQL` exists to remove (#104).
 *
 * `dbCredentials` is only read by commands that talk to a database (`migrate`,
 * `studio`); `generate` needs no connection. `drizzle-kit` does not load `.env`
 * on its own — the `--env-file-if-exists` flag in the `dev` script is a **tsx**
 * flag, not a Node-wide one — so this config loads it explicitly. Existing
 * environment variables still take precedence.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
