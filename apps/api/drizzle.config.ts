import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "drizzle-kit";

if (existsSync(".env")) {
  loadEnvFile();
}

/**
 * `drizzle-kit` config. `generate` diffs `src/schema.ts` against the snapshot in
 * `drizzle/meta/` and writes a versioned `.sql` — which is reviewed and
 * committed like any other code. `drizzle-kit push` is deliberately never used:
 * it applies a schema diff with no file, no history and no record of what ran,
 * which is the exact pain retiring `SCHEMA_SQL` exists to remove (#104).
 *
 * **Generate from the repo root — `pnpm db:generate`, not
 * `pnpm --filter @unshelf/api db:generate`.** The enum `CHECK`s are baked from
 * `packages/shared/dist` at generate time, so the root script routes through
 * turbo's `dependsOn: ["^build"]` to guarantee that build is current. Running
 * the filtered form directly bypasses turbo and can silently emit a `CHECK`
 * built from a stale `dist`.
 *
 * `dbCredentials` is only read by commands that talk to a database (`migrate`,
 * `studio`); `generate` needs no connection. `drizzle-kit` does not load `.env`
 * on its own, so this config uses Node's built-in loader when the file exists.
 * Existing environment variables still take precedence.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
