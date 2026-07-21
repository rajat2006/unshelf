import { fileURLToPath } from "node:url";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Express } from "express";
import type { Pool } from "pg";
import type { ClerkUserId } from "@unshelf/shared";
import { createApp } from "../src/app";
import { createAuthMiddleware } from "../src/auth";
import type { Identify } from "../src/auth";
import { createPool } from "../src/db";

/**
 * The committed migration folder, resolved from this file rather than the
 * process cwd so the suite runs the same way from the package or the repo root.
 */
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

/**
 * Bring a fresh database up to the current schema by replaying the **real
 * committed migrations** (#104). The test schema is therefore provably the
 * deployed schema, and a migration that fails to apply fails `pnpm test` rather
 * than a deploy.
 */
export async function migrateTestDatabase(pool: Pool): Promise<void> {
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
}

/**
 * The api test harness (extends T1's): an ephemeral Postgres, the schema applied,
 * and the real app — but wired with a Clerk-free auth chain. This is the
 * injection seam in action: `createAuthMiddleware` takes an `Identify`; the
 * default reads `x-test-clerk-user-id`, while a browser harness can supply its own
 * local credential reader. Either can act as any User (and provision a real
 * `users` row) without touching Clerk. It is the same middleware production uses;
 * only the identity source differs.
 */
export const TEST_USER_HEADER = "x-test-clerk-user-id";

export interface TestApp {
  app: Express;
  pool: Pool;
  stop: () => Promise<void>;
}

export async function startTestApp(
  identify: Identify = identifyFromTestHeader,
): Promise<TestApp> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:16-alpine",
  ).start();
  const pool = createPool(container.getConnectionUri());
  await migrateTestDatabase(pool);

  const auth = createAuthMiddleware(pool, identify);
  const app = createApp(pool, [auth]);

  return {
    app,
    pool,
    stop: async () => {
      await pool.end();
      await container.stop();
    },
  };
}

const identifyFromTestHeader: Identify = (req) => {
  const header = req.header(TEST_USER_HEADER);
  return header && header.length > 0 ? (header as ClerkUserId) : null;
};
